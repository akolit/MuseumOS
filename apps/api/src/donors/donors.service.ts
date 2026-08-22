import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database';
import type { CreateDonorInput, UpdateDonorInput } from '@museumos/contracts';

// Optional fields shared between create() and update() — apply consistently.
function profileData(input: CreateDonorInput | UpdateDonorInput) {
  const data: Record<string, unknown> = {};
  if (input.fatherName !== undefined) data.fatherName = input.fatherName || null;
  if (input.address !== undefined) data.address = input.address || null;
  if (input.city !== undefined) data.city = input.city || null;
  if (input.phone !== undefined) data.phone = input.phone || null;
  if (input.email !== undefined) data.email = input.email || null;
  if (input.taxId !== undefined) data.taxId = input.taxId || null;
  if (input.comment !== undefined) data.comment = input.comment || null;
  if (input.firstDonationAt !== undefined) {
    data.firstDonationAt = input.firstDonationAt ? new Date(input.firstDonationAt) : null;
  }
  if (input.legacyId !== undefined) data.legacyId = input.legacyId || null;
  if (input.isPublic !== undefined) data.isPublic = input.isPublic;
  return data;
}

@Injectable()
export class DonorsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async findAll() {
    return this.db.donor.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { exhibits: true } } },
    });
  }

  // Public, unauthenticated list for the external marketing site (the museum's
  // donor wall). PII (email, phone, taxId, address, comment) MUST NOT leak, so
  // this uses an explicit `select` allowlist rather than returning the row —
  // adding a column to the model can't silently expose it here.
  async findAllPublic() {
    const donors = await this.db.donor.findMany({
      where: { isPublic: true },
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    return { donors };
  }

  // Autocomplete for @-mentions in comments. A numeric query matches the donor
  // number (legacyId) by prefix; anything else matches the name. Numbers are
  // sorted numerically so "12" lists 12, 120, 121… in a sensible order.
  async search(q: string, limit: number) {
    const trimmed = q.trim();
    if (!trimmed) return [];
    const numeric = /^\d+$/.test(trimmed);
    const rows = await this.db.donor.findMany({
      where: numeric
        ? { legacyId: { startsWith: trimmed } }
        : { name: { contains: trimmed, mode: 'insensitive' } },
      select: { id: true, legacyId: true, name: true },
      take: numeric ? 100 : limit,
    });
    if (numeric) {
      rows.sort((a, b) => Number(a.legacyId) - Number(b.legacyId));
      return rows.slice(0, limit);
    }
    return rows;
  }

  // Resolves @-mention donor numbers (legacyIds) to {id, legacyId, name} so the
  // UI can link them. Leading zeros are normalised away ("@007" → donor 7).
  async resolveMentions(numbers: string[]) {
    const ids = [...new Set(
      numbers.filter((n) => /^\d+$/.test(n)).map((n) => String(Number(n))),
    )];
    if (ids.length === 0) return [];
    return this.db.donor.findMany({
      where: { legacyId: { in: ids } },
      select: { id: true, legacyId: true, name: true },
    });
  }

  async findById(id: string) {
    const donor = await this.db.donor.findUnique({
      where: { id },
      include: { _count: { select: { exhibits: true } } },
    });
    if (!donor) throw new NotFoundException('Donor not found');
    return donor;
  }

  async create(input: CreateDonorInput) {
    const existing = await this.db.donor.findUnique({ where: { name: input.name } });
    if (existing) throw new ConflictException('Donor already exists');

    const profile = profileData(input);
    // Give every new donor a visible ID by continuing the sequential donor
    // numbering: the legacy registry used 1..663, so new donors get 664, 665…
    // Only auto-assign when the caller didn't supply one. Loop guards against
    // the rare concurrent-insert collision on the unique legacy_id.
    const autoId = profile.legacyId == null;
    for (let attempt = 0; ; attempt++) {
      if (autoId) {
        const rows = await this.db.$queryRaw<Array<{ max: number | null }>>`
          SELECT MAX(CAST(legacy_id AS INTEGER)) AS max
          FROM donors WHERE legacy_id ~ '^[0-9]+$'`;
        profile.legacyId = String((rows[0]?.max ?? 0) + 1);
      }
      try {
        return await this.db.donor.create({
          data: { name: input.name, ...profile },
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? '');
        if (autoId && code === 'P2002' && target.includes('legacy') && attempt < 4) continue;
        throw e;
      }
    }
  }

  async update(id: string, input: UpdateDonorInput) {
    await this.findById(id);

    // Name uniqueness only matters when name is actually changing.
    if (input.name !== undefined) {
      const dup = await this.db.donor.findFirst({
        where: { name: input.name, NOT: { id } },
      });
      if (dup) throw new ConflictException('Donor name already in use');
    }

    const data: Record<string, unknown> = profileData(input);
    if (input.name !== undefined) data.name = input.name;

    return this.db.donor.update({ where: { id }, data });
  }

  async merge(targetId: string, sourceIds: string[]) {
    await this.findById(targetId);

    await this.db.$transaction(async (tx) => {
      await tx.exhibit.updateMany({
        where: { donorId: { in: sourceIds } },
        data: { donorId: targetId },
      });
      await tx.donor.deleteMany({
        where: { id: { in: sourceIds } },
      });
    });

    return this.findById(targetId);
  }
}
