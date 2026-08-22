import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database';
import {
  createBudgetItemSchema,
  updateBudgetItemSchema,
  createBudgetSnapshotSchema,
  type BudgetItem,
  type BudgetSnapshotMeta,
} from '@museumos/contracts';

// Common Greek-museum line items the operator can seed when starting blank.
// Order is meaningful — these populate `position` so they render in a
// sensible reading order on first open.
const TEMPLATE_INCOME: ReadonlyArray<{ category: string; name: string }> = [
  { category: 'Visitors',    name: 'Tickets' },
  { category: 'Donations',   name: 'Individual donations' },
  { category: 'Grants',      name: 'Public grants' },
  { category: 'Sponsorship', name: 'Corporate sponsorships' },
  { category: 'Retail',      name: 'Shop sales' },
  { category: 'Retail',      name: 'Café sales' },
  { category: 'Other',       name: 'Venue rental' },
];

const TEMPLATE_EXPENSE: ReadonlyArray<{ category: string; name: string }> = [
  { category: 'Operational', name: 'Rent' },
  { category: 'Operational', name: 'Electricity' },
  { category: 'Operational', name: 'Water' },
  { category: 'Operational', name: 'Internet' },
  { category: 'Operational', name: 'Insurance' },
  { category: 'Personnel',   name: 'Salaries' },
  { category: 'Operational', name: 'Maintenance' },
  { category: 'Marketing',   name: 'Marketing' },
  { category: 'Operational', name: 'Cleaning' },
  { category: 'Operational', name: 'Supplies' },
];

@Injectable()
export class BudgetService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async list(): Promise<BudgetItem[]> {
    const rows = await this.db.budgetItem.findMany({
      orderBy: [{ kind: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(format);
  }

  async create(body: unknown): Promise<BudgetItem> {
    const parsed = createBudgetItemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    // If no position supplied, append to the end of the chosen kind.
    let position = parsed.data.position;
    if (position === undefined) {
      const last = await this.db.budgetItem.findFirst({
        where: { kind: parsed.data.kind },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = (last?.position ?? -1) + 1;
    }

    const created = await this.db.budgetItem.create({
      data: {
        kind: parsed.data.kind,
        category: parsed.data.category,
        name: parsed.data.name,
        forecastAmount: new Prisma.Decimal(parsed.data.forecastAmount),
        actualAmount: parsed.data.actualAmount != null ? new Prisma.Decimal(parsed.data.actualAmount) : null,
        minAmount: parsed.data.minAmount != null ? new Prisma.Decimal(parsed.data.minAmount) : null,
        maxAmount: parsed.data.maxAmount != null ? new Prisma.Decimal(parsed.data.maxAmount) : null,
        confidence: parsed.data.confidence ?? null,
        notes: parsed.data.notes ?? null,
        position,
      },
    });
    return format(created);
  }

  async update(id: string, body: unknown): Promise<BudgetItem> {
    const parsed = updateBudgetItemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const existing = await this.db.budgetItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Budget item not found');

    const data: Record<string, unknown> = {};
    if (parsed.data.kind !== undefined) data.kind = parsed.data.kind;
    if (parsed.data.category !== undefined) data.category = parsed.data.category;
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.forecastAmount !== undefined) {
      data.forecastAmount = new Prisma.Decimal(parsed.data.forecastAmount);
    }
    if (parsed.data.actualAmount !== undefined) {
      data.actualAmount = parsed.data.actualAmount === null
        ? null
        : new Prisma.Decimal(parsed.data.actualAmount);
    }
    if (parsed.data.minAmount !== undefined) {
      data.minAmount = parsed.data.minAmount === null
        ? null
        : new Prisma.Decimal(parsed.data.minAmount);
    }
    if (parsed.data.maxAmount !== undefined) {
      data.maxAmount = parsed.data.maxAmount === null
        ? null
        : new Prisma.Decimal(parsed.data.maxAmount);
    }
    if (parsed.data.confidence !== undefined) data.confidence = parsed.data.confidence;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    if (parsed.data.position !== undefined) data.position = parsed.data.position;

    const updated = await this.db.budgetItem.update({ where: { id }, data });
    return format(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.db.budgetItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Budget item not found');
    await this.db.budgetItem.delete({ where: { id } });
  }

  // Bulk reposition — applies position by array index. The UI sends the
  // ordered list of ids per kind after a drag-drop. One transaction so the
  // UI never sees a half-reordered list.
  async reorder(orderedIds: string[]): Promise<void> {
    await this.db.$transaction(
      orderedIds.map((id, position) =>
        this.db.budgetItem.update({ where: { id }, data: { position } }),
      ),
    );
  }

  // Seed the standard set of starter line items. Only fires if the table is
  // currently empty — refuses to "merge" templates over an existing budget.
  async seedTemplates(): Promise<BudgetItem[]> {
    const count = await this.db.budgetItem.count();
    if (count > 0) {
      throw new BadRequestException(
        'Budget already has items — clear them first if you want to start over from a template.',
      );
    }

    const incomeRows = TEMPLATE_INCOME.map((row, i) => ({
      kind: 'income',
      category: row.category,
      name: row.name,
      forecastAmount: new Prisma.Decimal(0),
      position: i,
    }));
    const expenseRows = TEMPLATE_EXPENSE.map((row, i) => ({
      kind: 'expense',
      category: row.category,
      name: row.name,
      forecastAmount: new Prisma.Decimal(0),
      position: i,
    }));
    await this.db.budgetItem.createMany({ data: [...incomeRows, ...expenseRows] });

    return this.list();
  }

  // ─── Snapshots ─────────────────────────────────────────────

  // List metadata for all snapshots, newest first. Includes computed
  // totals so the operator can pick the right snapshot from a hover
  // without round-tripping for the full data blob.
  async listSnapshots(): Promise<BudgetSnapshotMeta[]> {
    const rows = await this.db.budgetSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { displayName: true } } },
    });
    return rows.map((row) => {
      const data = row.data as unknown as BudgetItem[];
      const items = Array.isArray(data) ? data : [];
      let forecastTotal = 0;
      let actualTotal: number | null = null;
      for (const it of items) {
        const sign = it.kind === 'expense' ? -1 : 1;
        forecastTotal += sign * (Number(it.forecastAmount) || 0);
        if (it.actualAmount != null) {
          actualTotal = (actualTotal ?? 0) + sign * Number(it.actualAmount);
        }
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        itemCount: items.length,
        forecastTotal,
        actualTotal,
        createdAt: row.createdAt.toISOString(),
        createdById: row.createdById,
        createdByDisplayName: row.createdBy?.displayName ?? null,
      };
    });
  }

  // Freeze the current budget into a new snapshot. Stores the full
  // BudgetItem[] in `data` as JSONB.
  async createSnapshot(body: unknown, actorId: string | null) {
    const parsed = createBudgetSnapshotSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const items = await this.list();

    return this.db.budgetSnapshot.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        data: items as unknown as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });
  }

  // Replace the entire live budget with the contents of the named
  // snapshot. Item IDs are regenerated on restore so we don't collide
  // with anything that might still be there from a partial delete.
  async restoreSnapshot(id: string): Promise<BudgetItem[]> {
    const snap = await this.db.budgetSnapshot.findUnique({ where: { id } });
    if (!snap) throw new NotFoundException('Snapshot not found');
    const items = snap.data as unknown as BudgetItem[];
    if (!Array.isArray(items)) {
      throw new BadRequestException('Snapshot data is malformed');
    }

    await this.db.$transaction([
      this.db.budgetItem.deleteMany({}),
      this.db.budgetItem.createMany({
        data: items.map((it, idx) => ({
          kind: it.kind,
          category: it.category,
          name: it.name,
          forecastAmount: new Prisma.Decimal(it.forecastAmount),
          actualAmount: it.actualAmount != null ? new Prisma.Decimal(it.actualAmount) : null,
          minAmount: it.minAmount != null ? new Prisma.Decimal(it.minAmount) : null,
          maxAmount: it.maxAmount != null ? new Prisma.Decimal(it.maxAmount) : null,
          confidence: it.confidence ?? null,
          notes: it.notes ?? null,
          position: typeof it.position === 'number' ? it.position : idx,
        })),
      }),
    ]);

    return this.list();
  }

  async deleteSnapshot(id: string): Promise<void> {
    const snap = await this.db.budgetSnapshot.findUnique({ where: { id } });
    if (!snap) throw new NotFoundException('Snapshot not found');
    await this.db.budgetSnapshot.delete({ where: { id } });
  }
}

function format(row: {
  id: string;
  kind: string;
  category: string;
  name: string;
  forecastAmount: Prisma.Decimal;
  actualAmount: Prisma.Decimal | null;
  minAmount: Prisma.Decimal | null;
  maxAmount: Prisma.Decimal | null;
  confidence: string | null;
  notes: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}): BudgetItem {
  return {
    id: row.id,
    kind: row.kind as BudgetItem['kind'],
    category: row.category,
    name: row.name,
    forecastAmount: Number(row.forecastAmount),
    actualAmount: row.actualAmount === null ? null : Number(row.actualAmount),
    minAmount: row.minAmount === null ? null : Number(row.minAmount),
    maxAmount: row.maxAmount === null ? null : Number(row.maxAmount),
    confidence: row.confidence as BudgetItem['confidence'],
    notes: row.notes,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
