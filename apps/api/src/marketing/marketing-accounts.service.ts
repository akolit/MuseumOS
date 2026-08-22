import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';
import {
  createSocialAccountSchema,
  type SocialAccount,
  type SocialAccountStatus,
  type SocialPlatform,
} from '@museumos/contracts';

// Manages the connected social handles. Real OAuth flows land later —
// for now the create endpoint accepts a manually-prepared payload so
// curators can seed test accounts. Tokens are stored cleartext during
// the wireframe phase; encrypted column lands before production
// (see migration comment).
@Injectable()
export class MarketingAccountsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(): Promise<SocialAccount[]> {
    const rows = await this.db.socialAccount.findMany({
      orderBy: [{ platform: 'asc' }, { connectedAt: 'desc' }],
      include: { connectedBy: { select: { displayName: true } } },
    });
    return rows.map(format);
  }

  async create(body: unknown, actorId: string | null): Promise<SocialAccount> {
    const parsed = createSocialAccountSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    try {
      const row = await this.db.socialAccount.create({
        data: {
          platform: parsed.data.platform,
          externalId: parsed.data.externalId,
          handle: parsed.data.handle ?? null,
          displayName: parsed.data.displayName ?? null,
          accessToken: parsed.data.accessToken,
          refreshToken: parsed.data.refreshToken ?? null,
          tokenExpiresAt: parsed.data.tokenExpiresAt ? new Date(parsed.data.tokenExpiresAt) : null,
          scopes: parsed.data.scopes ?? null,
          connectedById: actorId ?? null,
        },
        include: { connectedBy: { select: { displayName: true } } },
      });
      return format(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('That platform handle is already connected');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.db.socialAccount.findUnique({
      where: { id }, select: { id: true },
    });
    if (!existing) throw new NotFoundException('Account not found');
    await this.db.socialAccount.delete({ where: { id } });
  }
}

function format(row: {
  id: string;
  platform: string;
  externalId: string;
  handle: string | null;
  displayName: string | null;
  status: string;
  tokenExpiresAt: Date | null;
  scopes: string | null;
  connectedById: string | null;
  connectedBy: { displayName: string } | null;
  connectedAt: Date;
  lastSyncedAt: Date | null;
  lastError: string | null;
}): SocialAccount {
  return {
    id: row.id,
    platform: row.platform as SocialPlatform,
    externalId: row.externalId,
    handle: row.handle,
    displayName: row.displayName,
    status: row.status as SocialAccountStatus,
    tokenExpiresAt: row.tokenExpiresAt ? row.tokenExpiresAt.toISOString() : null,
    scopes: row.scopes,
    connectedById: row.connectedById,
    connectedByDisplayName: row.connectedBy?.displayName ?? null,
    connectedAt: row.connectedAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    lastError: row.lastError,
  };
}
