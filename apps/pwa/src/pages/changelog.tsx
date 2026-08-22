import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
// Same source file as the admin web's /changelog page. The PWA's Dockerfile
// COPYs it into the build context so the ?raw import resolves in production.
import changelog from '../../../../CHANGELOG.md?raw';

export function ChangelogPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-2 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur">
        <Link
          to="/profile"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
          aria-label={t('common.back') as string}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{t('changelog.title')}</h1>
        </div>
      </header>

      <article className="flex-1 px-4 py-4 text-sm leading-relaxed">
        <ReactMarkdown
          components={{
            // The .md file has a top-level "# Changelog" we hide because the
            // header already shows the page title.
            h1: () => null,
            h2: ({ children }) => (
              <h2 className="mt-5 border-b border-border pb-1.5 font-display text-base font-semibold first:mt-0">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
            ),
            p: ({ children }) => <p className="my-2 text-muted-foreground">{children}</p>,
            ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1 marker:text-primary/70">{children}</ul>,
            li: ({ children }) => <li className="pl-1">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
            code: ({ children }) => (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{children}</code>
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
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
