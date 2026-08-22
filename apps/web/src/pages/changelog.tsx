import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
// Vite imports markdown as a raw string when suffixed with ?raw. This bakes
// the changelog into the bundle at build time — no fetch, no caching games.
// The file lives at the repo root so GitHub renders it nicely too.
import changelog from '../../../../CHANGELOG.md?raw';

export function ChangelogPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">{t('changelog.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('changelog.subtitle')}</p>
      </div>

      {/* Plain markdown rendering with Tailwind classes per element type.
          Avoids @tailwindcss/typography to keep our css surface small —
          this file's vocabulary is small (h2/h3/ul/p/strong/code). */}
      <article className="rounded-lg border border-border bg-card p-6 text-sm leading-relaxed">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h2 className="mb-3 font-display text-xl font-bold">{children}</h2>
            ),
            h2: ({ children }) => (
              <h3 className="mt-7 border-b border-border pb-1.5 font-display text-lg font-semibold first:mt-0">{children}</h3>
            ),
            h3: ({ children }) => (
              <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>
            ),
            p: ({ children }) => <p className="my-2 text-muted-foreground">{children}</p>,
            ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1 marker:text-primary/70">{children}</ul>,
            li: ({ children }) => <li className="pl-1 text-foreground/90">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
            code: ({ children }) => (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {children}
              </a>
            ),
          }}
        >
          {changelog}
        </ReactMarkdown>
      </article>
    </div>
  );
}
