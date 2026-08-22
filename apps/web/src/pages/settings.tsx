import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Save, Loader2, ShoppingBag, Check, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const EBAY_MARKETPLACES: { code: string; label: string; site: string }[] = [
  { code: 'ALL_EU',  label: 'All Europe (fan-out)', site: 'GB·DE·FR·IT·ES·NL·AT·BE·CH·IE·PL' },
  { code: 'EBAY_US', label: 'United States', site: 'ebay.com' },
  { code: 'EBAY_GB', label: 'United Kingdom', site: 'ebay.co.uk' },
  { code: 'EBAY_DE', label: 'Germany',         site: 'ebay.de' },
  { code: 'EBAY_FR', label: 'France',          site: 'ebay.fr' },
  { code: 'EBAY_IT', label: 'Italy',           site: 'ebay.it' },
  { code: 'EBAY_ES', label: 'Spain',           site: 'ebay.es' },
  { code: 'EBAY_NL', label: 'Netherlands',     site: 'ebay.nl' },
  { code: 'EBAY_AT', label: 'Austria',         site: 'ebay.at' },
  { code: 'EBAY_BE', label: 'Belgium',         site: 'ebay.be' },
  { code: 'EBAY_CH', label: 'Switzerland',     site: 'ebay.ch' },
  { code: 'EBAY_IE', label: 'Ireland',         site: 'ebay.ie' },
  { code: 'EBAY_PL', label: 'Poland',          site: 'ebay.pl' },
  { code: 'EBAY_AU', label: 'Australia',       site: 'ebay.com.au' },
  { code: 'EBAY_CA', label: 'Canada',          site: 'ebay.ca' },
];

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [lang, setLang] = useState(i18n.resolvedLanguage ?? 'en');

  function changeLanguage(newLang: string) {
    setLang(newLang);
    void i18n.changeLanguage(newLang);
  }

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, unknown>>('/settings'),
  });

  const setMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.patch(`/settings/${encodeURIComponent(key)}`, { value }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSavedKey(vars.key);
      setTimeout(() => setSavedKey((k) => (k === vars.key ? null : k)), 1500);
      toast.success(t('toast.saved'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const ebayMarketplace = (settings?.['ebay.marketplace'] as string | undefined) ?? '';
  const [draftMarketplace, setDraftMarketplace] = useState<string>('');

  useEffect(() => {
    setDraftMarketplace(ebayMarketplace);
  }, [ebayMarketplace]);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold">{t('settings.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>

      <section className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="font-medium">{t('settings.language')}</h2>
        </div>
        <div className="p-5">
          <p className="mb-2 text-xs text-muted-foreground">{t('settings.languageHint')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => changeLanguage('en')}
              className={`rounded-control border px-3 py-1.5 text-sm transition-colors ${
                lang === 'en' ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'
              }`}
            >
              {t('common.languageEnglish')}
            </button>
            <button
              onClick={() => changeLanguage('el')}
              className={`rounded-control border px-3 py-1.5 text-sm transition-colors ${
                lang === 'el' ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'
              }`}
            >
              {t('common.languageGreek')}
            </button>
            <button
              onClick={() => changeLanguage('fr')}
              className={`rounded-control border px-3 py-1.5 text-sm transition-colors ${
                lang === 'fr' ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'
              }`}
            >
              {t('common.languageFrench')}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <h2 className="font-medium">{t('settings.ebayIntegration')}</h2>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('settings.marketplace')}
            </label>
            <p className="mb-2 text-xs text-muted-foreground">{t('settings.marketplaceHint')}</p>
            <div className="flex items-center gap-2">
              <select
                value={draftMarketplace}
                onChange={(e) => setDraftMarketplace(e.target.value)}
                className="flex-1 rounded-control border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">{t('settings.useEnvDefault')}</option>
                {EBAY_MARKETPLACES.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label} — {m.site} ({m.code})
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  setMutation.mutate({
                    key: 'ebay.marketplace',
                    value: draftMarketplace || null,
                  })
                }
                disabled={setMutation.isPending || draftMarketplace === ebayMarketplace}
                className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {setMutation.isPending && setMutation.variables?.key === 'ebay.marketplace' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : savedKey === 'ebay.marketplace' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-muted-foreground/70">
        Made by Antoine de Kolitso
      </p>
    </div>
  );
}
