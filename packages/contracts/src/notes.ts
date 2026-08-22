import { z } from 'zod';

// Conservation-log entry types. Strings (not a TS enum) so they can be
// freely interpolated in URLs, JSON, and i18n keys. Add to the end —
// renaming would orphan existing rows in the DB.
export const noteTypes = [
  'acquired',
  'cleaned',
  'repaired',
  'maintenance',
  'inspected',
  'photographed',
  'displayed',
  'damaged',
  'other',
] as const;

export type NoteType = (typeof noteTypes)[number];

export const createNoteSchema = z.object({
  occurredAt: z.string().datetime(),
  type: z.enum(noteTypes),
  text: z.string().min(1).max(5000),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

// Partial update — any subset of fields can be changed.
export const updateNoteSchema = createNoteSchema.partial();

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const noteSchema = z.object({
  id: z.string().uuid(),
  exhibitId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  type: z.enum(noteTypes),
  text: z.string(),
  authorId: z.string().uuid().nullable(),
  // Display string for the UI — fallback "Unknown" when the author was
  // deleted. Resolved server-side so each client doesn't have to fetch users.
  authorDisplayName: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Note = z.infer<typeof noteSchema>;
