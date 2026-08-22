import { z } from 'zod';

export const auditLogEntrySchema = z.object({
  id: z.number(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  action: z.enum(['create', 'update', 'delete', 'restore', 'login', 'login_failed', 'role_change', 'password_reset']),
  actorId: z.string().uuid().nullable(),
  diff: z.record(z.array(z.unknown()).length(2)).nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  at: z.string().datetime(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const auditQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
