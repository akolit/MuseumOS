import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database';
import {
  createNoteSchema,
  updateNoteSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
  type Note,
} from '@museumos/contracts';
import { AuditAction, AuditService } from '../audit/audit.service';

@Injectable()
export class ExhibitNotesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // Newest-first by default; the UI exposes a toggle and passes order: 'asc'
  // to flip to oldest-first.
  async list(exhibitId: string, order: 'asc' | 'desc' = 'desc'): Promise<Note[]> {
    const rows = await this.db.exhibitNote.findMany({
      where: { exhibitId },
      orderBy: { occurredAt: order },
      include: { author: { select: { displayName: true } } },
    });
    return rows.map((r) => format(r));
  }

  async create(
    exhibitId: string,
    body: unknown,
    actorId: string,
  ): Promise<Note> {
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    const input: CreateNoteInput = parsed.data;

    const exists = await this.db.exhibit.findFirst({
      where: { id: exhibitId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Exhibit not found');

    const created = await this.db.exhibitNote.create({
      data: {
        exhibitId,
        occurredAt: new Date(input.occurredAt),
        type: input.type,
        text: input.text,
        authorId: actorId,
      },
      include: { author: { select: { displayName: true } } },
    });

    await this.audit.log({
      entityType: 'exhibit_note',
      entityId: created.id,
      action: AuditAction.CREATE,
      actorId,
      diff: { exhibitId, type: input.type },
    });

    return format(created);
  }

  // canDeleteOthers maps to the `exhibit:delete` permission on the caller —
  // only senior_curator and admin can edit notes they didn't author.
  async update(
    exhibitId: string,
    noteId: string,
    body: unknown,
    actorId: string,
    canEditOthers: boolean,
  ): Promise<Note> {
    const parsed = updateNoteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    const input: UpdateNoteInput = parsed.data;

    const existing = await this.db.exhibitNote.findFirst({
      where: { id: noteId, exhibitId },
      select: { id: true, authorId: true },
    });
    if (!existing) throw new NotFoundException('Note not found');
    if (existing.authorId !== actorId && !canEditOthers) {
      throw new BadRequestException('You can only edit your own notes');
    }

    const data: Record<string, unknown> = {};
    if (input.occurredAt !== undefined) data.occurredAt = new Date(input.occurredAt);
    if (input.type !== undefined) data.type = input.type;
    if (input.text !== undefined) data.text = input.text;

    const updated = await this.db.exhibitNote.update({
      where: { id: noteId },
      data,
      include: { author: { select: { displayName: true } } },
    });

    await this.audit.log({
      entityType: 'exhibit_note',
      entityId: noteId,
      action: AuditAction.UPDATE,
      actorId,
      diff: input as Record<string, unknown>,
    });

    return format(updated);
  }

  // Hard delete. Audit log retains the action.
  async delete(exhibitId: string, noteId: string, actorId: string) {
    const existing = await this.db.exhibitNote.findFirst({
      where: { id: noteId, exhibitId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Note not found');

    await this.db.exhibitNote.delete({ where: { id: noteId } });

    await this.audit.log({
      entityType: 'exhibit_note',
      entityId: noteId,
      action: AuditAction.DELETE,
      actorId,
    });
  }
}

function format(row: {
  id: string;
  exhibitId: string;
  occurredAt: Date;
  type: string;
  text: string;
  authorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { displayName: string } | null;
}): Note {
  return {
    id: row.id,
    exhibitId: row.exhibitId,
    occurredAt: row.occurredAt.toISOString(),
    type: row.type as Note['type'],
    text: row.text,
    authorId: row.authorId,
    authorDisplayName: row.author?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
