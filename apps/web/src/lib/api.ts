const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, extractMessage(body) ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Pull the most useful human-readable message out of the API's error body.
// Handles three common shapes:
//   - NestJS default:   { message: "...", error: "...", statusCode: ... }
//   - NestJS w/ array:  { message: ["...", "..."], ... }
//   - Zod flatten():    { formErrors: [...], fieldErrors: { field: ["msg"] } }
function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  // Zod flatten — turn fieldErrors into "field: msg" lines.
  if ('fieldErrors' in b && b.fieldErrors && typeof b.fieldErrors === 'object') {
    const parts: string[] = [];
    for (const [field, msgs] of Object.entries(b.fieldErrors as Record<string, unknown>)) {
      if (Array.isArray(msgs) && msgs.length > 0) parts.push(`${field}: ${msgs[0]}`);
    }
    if (Array.isArray(b.formErrors)) parts.push(...(b.formErrors as string[]));
    if (parts.length > 0) return parts.join(' · ');
  }

  // NestJS default — message can be a string or an array of strings.
  if (typeof b.message === 'string') return b.message;
  if (Array.isArray(b.message) && b.message.length > 0) return b.message.join(' · ');

  return null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
