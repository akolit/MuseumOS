import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../../settings';

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

export interface EbaySearchItem {
  itemId: string;
  title: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  price: { value: string; currency: string } | null;
  itemWebUrl: string;
  condition: string | null;
  itemLocationCountry: string | null;
  buyingOptions: string[];
  itemEndDate: string | null;
  itemCreationDate: string | null;
  shortDescription: string | null;
}

@Injectable()
export class EbayService {
  private readonly logger = new Logger(EbayService.name);
  private cachedToken: CachedToken | null = null;

  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  private async getMarketplaceFromSettings(): Promise<string> {
    const value = await this.settings.get<string>('ebay.marketplace');
    return value ?? process.env.EBAY_MARKETPLACE ?? 'EBAY_GB';
  }

  private getStaticCredentials(): { clientId: string; clientSecret: string; baseUrl: string } {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'eBay integration is not configured. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env, then restart the API.',
      );
    }
    const env = (process.env.EBAY_ENV ?? 'production').toLowerCase();
    const baseUrl =
      env === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
    return { clientId, clientSecret, baseUrl };
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.token;
    }

    const { clientId, clientSecret, baseUrl } = this.getStaticCredentials();
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch(`${baseUrl}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'https://api.ebay.com/oauth/api_scope',
      }).toString(),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      this.logger.error(`eBay token request failed: ${res.status} ${txt.slice(0, 300)}`);
      throw new ServiceUnavailableException('Failed to authenticate with eBay.');
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return this.cachedToken.token;
  }

  // Marketplaces fanned out when "ALL_EU" is selected. Order matters for tie-breaks.
  private static readonly EU_MARKETPLACES = [
    'EBAY_GB', 'EBAY_DE', 'EBAY_FR', 'EBAY_IT', 'EBAY_ES',
    'EBAY_NL', 'EBAY_AT', 'EBAY_BE', 'EBAY_CH', 'EBAY_IE', 'EBAY_PL',
  ];

  async getMarketplace(): Promise<string> {
    return this.getMarketplaceFromSettings();
  }

  async search(opts: { q: string; isbn?: string; limit?: number }): Promise<EbaySearchItem[]> {
    const limit = Math.min(Math.max(opts.limit ?? 24, 1), 50);
    const marketplace = await this.getMarketplaceFromSettings();

    if (marketplace === 'ALL_EU') {
      // Fan out across EU marketplaces in parallel, merge & dedupe.
      const perMarket = Math.max(8, Math.ceil(limit / 3)); // some headroom for dedup
      const results = await Promise.allSettled(
        EbayService.EU_MARKETPLACES.map((m) =>
          this.searchSingle({ q: opts.q, isbn: opts.isbn, limit: perMarket, marketplace: m }),
        ),
      );

      const seen = new Set<string>();
      const merged: EbaySearchItem[] = [];
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const item of r.value) {
          if (seen.has(item.itemId)) continue;
          seen.add(item.itemId);
          merged.push(item);
        }
      }

      // Sort: items with images first, then by listing date desc.
      merged.sort((a, b) => {
        if (!!a.thumbnailUrl !== !!b.thumbnailUrl) return a.thumbnailUrl ? -1 : 1;
        const aDate = a.itemCreationDate ?? '';
        const bDate = b.itemCreationDate ?? '';
        return bDate.localeCompare(aDate);
      });
      return merged.slice(0, limit);
    }

    return this.searchSingle({ q: opts.q, isbn: opts.isbn, limit, marketplace });
  }

  private async searchSingle(opts: {
    q: string;
    isbn?: string;
    limit: number;
    marketplace: string;
  }): Promise<EbaySearchItem[]> {
    const token = await this.getAccessToken();
    const { baseUrl } = this.getStaticCredentials();
    const limit = opts.limit;
    const marketplace = opts.marketplace;

    const params = new URLSearchParams({
      q: opts.q,
      limit: String(limit),
    });
    if (opts.isbn) {
      const cleanIsbn = opts.isbn.replace(/[^0-9Xx]/g, '');
      if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
        // Restrict by GTIN for higher precision
        params.set('filter', `gtin:${cleanIsbn}`);
      }
    }

    const url = `${baseUrl}/buy/browse/v1/item_summary/search?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplace,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      this.logger.error(`eBay search failed: ${res.status} ${txt.slice(0, 300)}`);
      throw new ServiceUnavailableException(`eBay search failed (${res.status}).`);
    }

    const data = (await res.json()) as {
      itemSummaries?: Array<{
        itemId: string;
        title: string;
        image?: { imageUrl?: string };
        thumbnailImages?: Array<{ imageUrl?: string }>;
        price?: { value?: string; currency?: string };
        itemWebUrl?: string;
        itemHref?: string;
        condition?: string;
        itemLocation?: { country?: string };
        buyingOptions?: string[];
        itemEndDate?: string;
        itemCreationDate?: string;
        shortDescription?: string;
      }>;
    };

    return (data.itemSummaries ?? []).map((it) => ({
      itemId: it.itemId,
      title: it.title,
      imageUrl: it.image?.imageUrl ?? null,
      thumbnailUrl: it.thumbnailImages?.[0]?.imageUrl ?? it.image?.imageUrl ?? null,
      price:
        it.price?.value && it.price?.currency
          ? { value: it.price.value, currency: it.price.currency }
          : null,
      itemWebUrl: it.itemWebUrl ?? it.itemHref ?? '#',
      condition: it.condition ?? null,
      itemLocationCountry: it.itemLocation?.country ?? null,
      buyingOptions: it.buyingOptions ?? [],
      itemEndDate: it.itemEndDate ?? null,
      itemCreationDate: it.itemCreationDate ?? null,
      shortDescription: it.shortDescription ?? null,
    }));
  }
}
