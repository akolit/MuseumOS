import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, ShoppingBag, ExternalLink, Tag as TagIcon } from 'lucide-react';
import { api } from '@/lib/api';

interface EbayItem {
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

interface ExhibitLike {
  exhibitName: string;
  category: { code: string };
  attributes?: Record<string, unknown> | null;
}

interface Props {
  open: boolean;
  exhibit: ExhibitLike;
  onClose: () => void;
}

// eBay marketplace ID → public domain used to build the fallback search URL.
const EBAY_DOMAIN_BY_MARKETPLACE: Record<string, string> = {
  EBAY_US: 'www.ebay.com',
  EBAY_GB: 'www.ebay.co.uk',
  EBAY_DE: 'www.ebay.de',
  EBAY_FR: 'www.ebay.fr',
  EBAY_IT: 'www.ebay.it',
  EBAY_ES: 'www.ebay.es',
  EBAY_AU: 'www.ebay.com.au',
  EBAY_CA: 'www.ebay.ca',
  EBAY_NL: 'www.ebay.nl',
  EBAY_PL: 'www.ebay.pl',
  EBAY_AT: 'www.ebay.at',
  EBAY_BE: 'www.ebay.be',
  EBAY_CH: 'www.ebay.ch',
  EBAY_IE: 'www.ebay.ie',
};

function formatPrice(price: { value: string; currency: string } | null): string {
  if (!price) return '—';
  const num = parseFloat(price.value);
  if (isNaN(num)) return `${price.value} ${price.currency}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(num);
  } catch {
    return `${num.toFixed(2)} ${price.currency}`;
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

export function EbaySheet({ open, exhibit, onClose }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<EbayItem[] | null>(null);
  const [marketplace, setMarketplace] = useState<string>('EBAY_US');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isbn = (exhibit.attributes ?? {})['isbn'] as string | undefined;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems(null);

    const params = new URLSearchParams({ q: exhibit.exhibitName });
    if (isbn && (exhibit.category.code === 'books' || exhibit.category.code === 'magazines')) {
      params.set('isbn', isbn);
    }

    api
      .get<{ items: EbayItem[]; marketplace?: string }>(`/integrations/ebay/search?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        if (res.marketplace) setMarketplace(res.marketplace);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [open, exhibit.exhibitName, exhibit.category.code, isbn]);

  if (!open) return null;

  const isAllEu = marketplace === 'ALL_EU';
  const ebayDomain = isAllEu ? 'ebay.de (EU)' : (EBAY_DOMAIN_BY_MARKETPLACE[marketplace] ?? 'www.ebay.com');
  const ebaySearchUrl = isAllEu
    ? `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(exhibit.exhibitName)}&LH_PrefLoc=3`
    : `https://${ebayDomain}/sch/i.html?_nkw=${encodeURIComponent(exhibit.exhibitName)}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="mt-auto max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex max-h-[90vh] flex-col rounded-t-2xl bg-card pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-xl">
          {/* Drag handle */}
          <div className="mx-auto mt-2 h-1 w-10 flex-shrink-0 rounded-full bg-muted-foreground/30" />

          <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 pt-2">
            <div className="flex min-w-0 items-center gap-2">
              <ShoppingBag className="h-4 w-4 flex-shrink-0 text-primary" />
              <h2 className="truncate text-sm font-semibold">{t('exhibit.ebaySimilarListings')}</h2>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          <a
            href={ebaySearchUrl}
            target="_blank"
            rel="noreferrer"
            className="mx-4 mt-1 mb-2 inline-flex flex-shrink-0 items-center gap-1 self-start truncate text-[11px] text-primary hover:underline"
          >
            <span className="truncate">"{exhibit.exhibitName}"{isbn && ` · ISBN ${isbn}`}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
            <span className="text-muted-foreground">· {ebayDomain}</span>
          </a>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('exhibit.searchingEbay')}
              </div>
            )}
            {error && !loading && (
              <div className="py-6 text-center text-sm">
                <p className="text-destructive">{error}</p>
                <a
                  href={ebaySearchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {t('exhibit.openEbaySearch')} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {items && !loading && items.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('exhibit.noEbayMatches')}</p>
            )}
            {items && items.length > 0 && (
              <ul className="grid grid-cols-2 gap-2">
                {items.map((it) => {
                  const endDate = formatDate(it.itemEndDate);
                  const created = formatDate(it.itemCreationDate);
                  const isAuction = it.buyingOptions.includes('AUCTION');
                  return (
                    <li key={it.itemId}>
                      <a
                        href={it.itemWebUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex flex-col overflow-hidden rounded-lg border border-border bg-card active:scale-[0.98]"
                      >
                        <div className="relative aspect-square w-full overflow-hidden bg-muted">
                          {it.thumbnailUrl ? (
                            <img
                              src={it.thumbnailUrl}
                              alt={it.title}
                              loading="lazy"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                              <ShoppingBag className="h-6 w-6" />
                            </div>
                          )}
                          {it.condition && (
                            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                              {it.condition}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-0.5 p-2">
                          <p className="line-clamp-2 text-[11px] font-medium leading-tight">{it.title}</p>
                          <div className="mt-auto flex items-center justify-between pt-1">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                              <TagIcon className="h-3 w-3" /> {formatPrice(it.price)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                            <span>{isAuction ? t('exhibit.auction') : t('exhibit.buyNow')}</span>
                            {isAuction && endDate
                              ? <span>{t('exhibit.ends')} {endDate}</span>
                              : created
                                ? <span>{created}</span>
                                : null}
                          </div>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
