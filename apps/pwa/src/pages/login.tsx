import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(identifier, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-12 pt-16">
      <div className="mb-8 flex flex-col items-center gap-3">
        <img
          src="/logo.png"
          alt="MuseumOS"
          className="w-full max-w-[280px] select-none"
          draggable={false}
        />
        <p className="text-sm text-muted-foreground">{t('common.signInToContinue')}</p>
      </div>

      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium">{t('common.emailOrName')}</label>
          <input
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t('common.emailOrNamePlaceholder') as string}
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">{t('common.password')}</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base focus:border-primary focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? '…' : t('common.signIn')}
        </button>
      </form>
    </div>
  );
}
