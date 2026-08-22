import {
  useEffect, useRef, useState, useMemo,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// A mention is "@" + either an exhibit display id (two letters + digits, e.g.
// @BK00009) or a donor number (digits only, e.g. @123). Global so we can both
// render and scan comment text with the same rule.
export const MENTION_RE = /@([A-Za-z]{2}\d+|\d+)/g;

// Canonical stored display id: uppercase prefix + digits zero-padded to 5.
// "bk9" / "BK00009" → "BK00009". Mirrors the server's canonicalDisplayId.
export function canonicalDisplayId(token: string): string | null {
  const m = token.match(/^([A-Za-z]{2})(\d+)$/);
  if (!m) return null;
  return `${m[1]!.toUpperCase()}${m[2]!.padStart(5, '0')}`;
}

// Classifies a mention token (the part after "@") into an exhibit or donor
// reference with the canonical key used to look it up. Returns null if neither.
type Classified =
  | { kind: 'exhibit'; key: string }
  | { kind: 'donor'; key: string };
function classify(token: string): Classified | null {
  if (/^\d+$/.test(token)) return { kind: 'donor', key: String(Number(token)) };
  const canon = canonicalDisplayId(token);
  if (canon) return { kind: 'exhibit', key: canon };
  return null;
}

export interface ExhibitMention { id: string; displayId: string; exhibitName: string }
export interface DonorMention { id: string; legacyId: string; name: string }
export interface MentionMaps {
  exhibits: Map<string, ExhibitMention>;
  donors: Map<string, DonorMention>;
}

interface ExhibitHit { id: string; displayId: string; exhibitName: string }
interface DonorHit { id: string; legacyId: string | null; name: string }

// Pull distinct exhibit/donor mention keys out of a batch of comment texts.
function collectTokens(texts: string[]): { exhibits: string[]; donors: string[] } {
  const exhibits = new Set<string>();
  const donors = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(MENTION_RE)) {
      const c = classify(m[1]!);
      if (c?.kind === 'exhibit') exhibits.add(c.key);
      else if (c?.kind === 'donor') donors.add(c.key);
    }
  }
  return { exhibits: [...exhibits], donors: [...donors] };
}

// Resolves the mentions in the given texts to exhibits and donors, each as a
// map keyed by its canonical id. Two batched requests for the whole list.
export function useMentionResolver(texts: string[]): MentionMaps {
  const { exhibits: exhibitTokens, donors: donorTokens } = useMemo(() => {
    const t = collectTokens(texts);
    t.exhibits.sort();
    t.donors.sort();
    return t;
  }, [texts]);

  const { data: exhibitData } = useQuery({
    queryKey: ['exhibit-mentions', exhibitTokens],
    queryFn: () => api.get<ExhibitMention[]>(`/exhibits/mentions?ids=${encodeURIComponent(exhibitTokens.join(','))}`),
    enabled: exhibitTokens.length > 0,
    staleTime: 60_000,
  });

  const { data: donorData } = useQuery({
    queryKey: ['donor-mentions', donorTokens],
    queryFn: () => api.get<DonorMention[]>(`/donors/mentions?ids=${encodeURIComponent(donorTokens.join(','))}`),
    enabled: donorTokens.length > 0,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const exhibits = new Map<string, ExhibitMention>();
    for (const m of exhibitData ?? []) exhibits.set(m.displayId, m);
    const donors = new Map<string, DonorMention>();
    for (const m of donorData ?? []) donors.set(m.legacyId, m);
    return { exhibits, donors };
  }, [exhibitData, donorData]);
}

// Renders comment text with @mentions turned into links — exhibits to
// /exhibits/:id, donor numbers to /donors/:id. Unresolved mentions (typo'd or
// deleted) stay as plain text. Whitespace is preserved.
export function MentionText({
  text,
  mentions,
  className,
}: {
  text: string;
  mentions: MentionMaps;
  className?: string;
}) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  const re = new RegExp(MENTION_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const token = m[1]!;
    const c = classify(token);
    let link: { to: string; title: string } | null = null;
    if (c?.kind === 'exhibit') {
      const hit = mentions.exhibits.get(c.key);
      if (hit) link = { to: `/exhibits/${hit.id}`, title: hit.exhibitName };
    } else if (c?.kind === 'donor') {
      const hit = mentions.donors.get(c.key);
      if (hit) link = { to: `/donors/${hit.id}`, title: hit.name };
    }
    if (last < m.index) parts.push(text.slice(last, m.index));
    if (link) {
      parts.push(
        <Link
          key={`${i}-${m.index}`}
          to={link.to}
          title={link.title}
          className="font-medium text-primary hover:underline"
        >
          @{token}
        </Link>,
      );
    } else {
      parts.push(m[0]);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));

  return <p className={className}>{parts}</p>;
}

// ── Autocomplete textarea ───────────────────────────────────────────────────

// Finds an in-progress mention immediately before the caret. Returns the "@"
// index and the partial query, or null when the caret isn't inside a mention.
function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(?:^|[^\w@])?@([A-Za-z0-9]*)$/);
  if (!m) return null;
  const atIndex = caret - m[1]!.length - 1;
  const prev = atIndex > 0 ? text[atIndex - 1] : '';
  if (prev && /\w/.test(prev)) return null; // avoid emails like "x@..."
  return { start: atIndex, query: m[1]! };
}

// A unified suggestion row, whether it came from the exhibit or donor search.
interface Suggestion { key: string; insert: string; primary: string; secondary: string }

type MentionTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

export function MentionTextarea({ value, onChange, ...props }: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const q = mention?.query ?? '';
    const h = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(h);
  }, [mention?.query]);

  // A query that starts with a digit looks up donors by number; otherwise
  // exhibits by display id / name.
  const mode: 'donor' | 'exhibit' = /^\d/.test(debounced) ? 'donor' : 'exhibit';

  const { data: raw } = useQuery<DonorHit[] | ExhibitHit[]>({
    queryKey: ['mention-suggest', mode, debounced],
    queryFn: () => mode === 'donor'
      ? api.get<DonorHit[]>(`/donors/search?q=${encodeURIComponent(debounced)}&limit=8`)
      : api.get<ExhibitHit[]>(`/exhibits/search?q=${encodeURIComponent(debounced)}&limit=8`),
    enabled: !!mention && debounced.trim().length >= 1,
    staleTime: 30_000,
  });

  const suggestions: Suggestion[] = useMemo(() => {
    if (!raw) return [];
    if (mode === 'donor') {
      return (raw as DonorHit[])
        .filter((d) => d.legacyId)
        .map((d) => ({ key: d.id, insert: `@${d.legacyId}`, primary: `#${d.legacyId}`, secondary: d.name }));
    }
    return (raw as ExhibitHit[])
      .map((e) => ({ key: e.id, insert: `@${e.displayId}`, primary: e.displayId, secondary: e.exhibitName }));
  }, [raw, mode]);

  const open = !!mention && suggestions.length > 0;
  useEffect(() => { setActive(0); }, [debounced]);

  function sync(text: string) {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    setMention(activeMention(text, caret));
  }

  function choose(s: Suggestion) {
    if (!mention) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const insert = `${s.insert} `;
    const next = value.slice(0, mention.start) + insert + value.slice(caret);
    onChange(next);
    setMention(null);
    const newCaret = mention.start + insert.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(newCaret, newCaret);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(suggestions[active]!); }
    else if (e.key === 'Escape') { e.preventDefault(); setMention(null); }
  }

  return (
    <div className="relative">
      <textarea
        {...props}
        ref={ref}
        value={value}
        onChange={(e) => { onChange(e.target.value); sync(e.target.value); }}
        onKeyDown={onKeyDown}
        onClick={(e) => sync((e.target as HTMLTextAreaElement).value)}
        onKeyUp={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key) && open) return;
          sync((e.target as HTMLTextAreaElement).value);
        }}
      />
      {open && (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-control border border-border bg-popover shadow-lg">
          {suggestions.map((s, idx) => (
            <li key={s.key}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); choose(s); }}
                onMouseEnter={() => setActive(idx)}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${idx === active ? 'bg-muted' : ''}`}
              >
                <span className="font-mono text-xs font-bold text-primary">{s.primary}</span>
                <span className="truncate">{s.secondary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
