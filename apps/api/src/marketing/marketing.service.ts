import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';
import {
  createMarketingPostSchema,
  updateMarketingPostSchema,
  type MarketingPost,
  type MarketingPostTarget,
  type SocialPlatform,
} from '@museumos/contracts';

// Service for the post lifecycle — drafts, scheduling, listing.
// Account connection + metric ingestion live in their own services so
// the responsibilities stay focused; the controller wires all three.
@Injectable()
export class MarketingService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // List posts in the calendar/inbox window. Defaults to the next 60
  // days plus the past 30; UI can narrow with explicit from/to.
  async list(filter: { status?: string; from?: Date; to?: Date }): Promise<MarketingPost[]> {
    const where: Prisma.MarketingPostWhereInput = { deletedAt: null };
    if (filter.status) where.status = filter.status;
    if (filter.from || filter.to) {
      where.OR = [
        {
          scheduledAt: {
            gte: filter.from ?? undefined,
            lte: filter.to ?? undefined,
          },
        },
        {
          publishedAt: {
            gte: filter.from ?? undefined,
            lte: filter.to ?? undefined,
          },
        },
      ];
    }
    const rows = await this.db.marketingPost.findMany({
      where,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      include: this.postInclude(),
    });
    return rows.map((r) => this.format(r));
  }

  async get(id: string): Promise<MarketingPost> {
    const row = await this.db.marketingPost.findFirst({
      where: { id, deletedAt: null },
      include: this.postInclude(),
    });
    if (!row) throw new NotFoundException('Marketing post not found');
    return this.format(row);
  }

  async create(body: unknown, actorId: string | null): Promise<MarketingPost> {
    const parsed = createMarketingPostSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    // Resolve target accounts up-front so we can reject IDs that
    // don't belong to a connected account in one shot rather than
    // mid-transaction.
    const targetAccountIds = parsed.data.targetAccountIds ?? [];
    if (targetAccountIds.length > 0) {
      const found = await this.db.socialAccount.findMany({
        where: { id: { in: targetAccountIds } },
        select: { id: true },
      });
      if (found.length !== targetAccountIds.length) {
        throw new BadRequestException('One or more target accounts do not exist');
      }
    }

    const status = parsed.data.scheduledAt ? 'scheduled' : 'draft';

    const created = await this.db.marketingPost.create({
      data: {
        status,
        kind: parsed.data.kind ?? 'exhibit',
        exhibitId: parsed.data.exhibitId ?? null,
        captionEl: parsed.data.captionEl ?? null,
        captionEn: parsed.data.captionEn ?? null,
        hashtags: (parsed.data.hashtags ?? null) as Prisma.InputJsonValue,
        imageStorageKey: parsed.data.imageStorageKey ?? null,
        extraImageKeys: (parsed.data.extraImageKeys ?? null) as Prisma.InputJsonValue,
        linkUrl: parsed.data.linkUrl ?? null,
        scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
        createdById: actorId ?? undefined,
        updatedById: actorId ?? undefined,
        targets: {
          create: targetAccountIds.map((accountId) => ({ accountId, status: 'pending' })),
        },
      },
      include: this.postInclude(),
    });
    return this.format(created);
  }

  async update(id: string, body: unknown, actorId: string | null): Promise<MarketingPost> {
    const parsed = updateMarketingPostSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const existing = await this.db.marketingPost.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Marketing post not found');

    const data: Prisma.MarketingPostUpdateInput = { updatedBy: { connect: { id: actorId ?? undefined } } };
    if (actorId == null) delete (data as { updatedBy?: unknown }).updatedBy;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.kind   !== undefined) data.kind   = parsed.data.kind;
    if (parsed.data.exhibitId !== undefined) {
      data.exhibit = parsed.data.exhibitId ? { connect: { id: parsed.data.exhibitId } } : { disconnect: true };
    }
    if (parsed.data.captionEl !== undefined) data.captionEl = parsed.data.captionEl;
    if (parsed.data.captionEn !== undefined) data.captionEn = parsed.data.captionEn;
    if (parsed.data.hashtags  !== undefined) data.hashtags  = (parsed.data.hashtags ?? null) as Prisma.InputJsonValue;
    if (parsed.data.imageStorageKey !== undefined) data.imageStorageKey = parsed.data.imageStorageKey;
    if (parsed.data.extraImageKeys  !== undefined) data.extraImageKeys  = (parsed.data.extraImageKeys ?? null) as Prisma.InputJsonValue;
    if (parsed.data.linkUrl !== undefined) data.linkUrl = parsed.data.linkUrl;
    if (parsed.data.scheduledAt !== undefined) {
      data.scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
      // Bump status to "scheduled" when a schedule appears on a draft.
      if (parsed.data.scheduledAt && existing.status === 'draft') data.status = 'scheduled';
    }

    // Target rewrite: when targetAccountIds is supplied, replace the
    // existing set wholesale. The DB cascade-deletes orphaned targets.
    if (parsed.data.targetAccountIds !== undefined) {
      const ids = parsed.data.targetAccountIds;
      if (ids.length > 0) {
        const found = await this.db.socialAccount.findMany({
          where: { id: { in: ids } }, select: { id: true },
        });
        if (found.length !== ids.length) throw new BadRequestException('Unknown target account');
      }
      await this.db.$transaction([
        this.db.marketingPostTarget.deleteMany({ where: { postId: id } }),
        this.db.marketingPostTarget.createMany({
          data: ids.map((accountId) => ({ postId: id, accountId, status: 'pending' })),
        }),
      ]);
    }

    const updated = await this.db.marketingPost.update({
      where: { id },
      data,
      include: this.postInclude(),
    });
    return this.format(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.db.marketingPost.findFirst({
      where: { id, deletedAt: null }, select: { id: true },
    });
    if (!existing) throw new NotFoundException('Marketing post not found');
    // Soft delete — keep history. Targets stay so analytics on past
    // posts isn't dropped; querying always filters deletedAt IS NULL.
    await this.db.marketingPost.update({
      where: { id }, data: { deletedAt: new Date() },
    });
  }

  // ─── helpers ─────────────────────────────────────────────────

  private postInclude() {
    return {
      exhibit: { select: { displayId: true, exhibitName: true } },
      createdBy: { select: { displayName: true } },
      targets: { include: { account: { select: { platform: true, handle: true } } } },
    } satisfies Prisma.MarketingPostInclude;
  }

  private format(row: Prisma.MarketingPostGetPayload<{ include: ReturnType<MarketingService['postInclude']> }>): MarketingPost {
    const targets: MarketingPostTarget[] = row.targets.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      platform: t.account.platform as SocialPlatform,
      handle: t.account.handle ?? null,
      status: t.status as MarketingPostTarget['status'],
      externalPostId: t.externalPostId,
      externalUrl: t.externalUrl,
      errorMessage: t.errorMessage,
      attempts: t.attempts,
      publishedAt: t.publishedAt ? t.publishedAt.toISOString() : null,
    }));
    return {
      id: row.id,
      status: row.status as MarketingPost['status'],
      kind: row.kind as MarketingPost['kind'],
      exhibitId: row.exhibitId,
      exhibitDisplayId: row.exhibit?.displayId ?? null,
      exhibitName: row.exhibit?.exhibitName ?? null,
      captionEl: row.captionEl,
      captionEn: row.captionEn,
      hashtags: Array.isArray(row.hashtags) ? (row.hashtags as string[]) : null,
      imageStorageKey: row.imageStorageKey,
      extraImageKeys: Array.isArray(row.extraImageKeys) ? (row.extraImageKeys as string[]) : null,
      linkUrl: row.linkUrl,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      createdById: row.createdById,
      createdByDisplayName: row.createdBy?.displayName ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      targets,
    };
  }
}
