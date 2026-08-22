import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

type Kind = 'income' | 'expense';

interface BudgetItem {
  id: string;
  kind: Kind;
  category: string;
  name: string;
  forecastAmount: number;
  actualAmount: number | null;
  position: number;
}

// Print-friendly view. No sidebar, no header — just the numbers. The
// operator can hit Cmd-P / Ctrl-P from here and the browser will produce
// a clean PDF / paper output suitable for a board or sponsor.
export function FinancialsPrintPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('el') ? 'el-GR' : i18n.language.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const fmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }),
    [locale],
  );
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'long' }),
    [locale],
  );

  const { data: items } = useQuery({
    queryKey: ['budget'],
    queryFn: () => api.get<BudgetItem[]>('/budget'),
  });

  // Default the document title so the saved PDF has a useful filename.
  useEffect(() => {
    const original = document.title;
    document.title = `${t('financials.title')} — ${dateFmt.format(new Date())}`;
    return () => { document.title = original; };
  }, [t, dateFmt]);

  if (!items) return <div className="p-8 text-sm text-muted-foreground">{t('common.loading')}</div>;

  const income = items.filter((i) => i.kind === 'income');
  const expenses = items.filter((i) => i.kind === 'expense');
  const incTotal = income.reduce((a, b) => a + b.forecastAmount, 0);
  const expTotal = expenses.reduce((a, b) => a + b.forecastAmount, 0);
  const incActualTotal = income.reduce((a, b) => a + (b.actualAmount ?? 0), 0);
  const expActualTotal = expenses.reduce((a, b) => a + (b.actualAmount ?? 0), 0);
  const forecastNet = incTotal - expTotal;
  const actualNet = incActualTotal - expActualTotal;
  const hasActuals = items.some((i) => i.actualAmount !== null);

  return (
    <div className="mx-auto max-w-3xl bg-white p-10 font-sans text-slate-900 print:p-0">
      <header className="mb-6 border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-bold">{t('financials.title')}</h1>
        <p className="mt-0.5 text-xs text-slate-500">{dateFmt.format(new Date())}</p>
      </header>

      <Section title={t('financials.income')} items={income} fmt={fmt} hasActuals={hasActuals} />
      <Section title={t('financials.expenses')} items={expenses} fmt={fmt} hasActuals={hasActuals} className="mt-6" />

      <div className="mt-8 border-t border-slate-300 pt-4">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1 font-medium">{t('financials.totalIncome')}</td>
              <td className="py-1 text-right tabular-nums">{fmt.format(incTotal)}</td>
              {hasActuals && <td className="py-1 text-right text-slate-500 tabular-nums">{fmt.format(incActualTotal)}</td>}
            </tr>
            <tr>
              <td className="py-1 font-medium">{t('financials.totalExpenses')}</td>
              <td className="py-1 text-right tabular-nums">{fmt.format(expTotal)}</td>
              {hasActuals && <td className="py-1 text-right text-slate-500 tabular-nums">{fmt.format(expActualTotal)}</td>}
            </tr>
            <tr className="border-t border-slate-300">
              <td className="py-1.5 text-lg font-bold">{t('financials.forecastNet')}</td>
              <td className={`py-1.5 text-right text-lg font-bold tabular-nums ${forecastNet >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {forecastNet >= 0 ? '+' : ''}{fmt.format(forecastNet)}
              </td>
              {hasActuals && (
                <td className={`py-1.5 text-right text-lg font-bold tabular-nums ${actualNet >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {actualNet >= 0 ? '+' : ''}{fmt.format(actualNet)}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Section({
  title, items, fmt, hasActuals, className,
}: {
  title: string;
  items: BudgetItem[];
  fmt: Intl.NumberFormat;
  hasActuals: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  // Group by category preserving order.
  const groups = new Map<string, BudgetItem[]>();
  for (const it of items) {
    const list = groups.get(it.category) ?? [];
    list.push(it);
    groups.set(it.category, list);
  }
  return (
    <section className={className}>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-1 font-medium">{t('financials.name')}</th>
            <th className="pb-1 text-right font-medium">{t('financials.forecastShort')}</th>
            {hasActuals && <th className="pb-1 text-right font-medium">{t('financials.actualShort')}</th>}
          </tr>
        </thead>
        <tbody>
          {Array.from(groups.entries()).map(([category, list]) => (
            <Group key={category} category={category} items={list} fmt={fmt} hasActuals={hasActuals} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Group({
  category, items, fmt, hasActuals,
}: {
  category: string;
  items: BudgetItem[];
  fmt: Intl.NumberFormat;
  hasActuals: boolean;
}) {
  const subTot = items.reduce((a, b) => a + b.forecastAmount, 0);
  const actualSubTot = items.reduce((a, b) => a + (b.actualAmount ?? 0), 0);
  return (
    <>
      <tr className="bg-slate-50">
        <td colSpan={hasActuals ? 3 : 2} className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {category}
        </td>
      </tr>
      {items.map((it) => (
        <tr key={it.id} className="border-b border-slate-100">
          <td className="py-1 pl-3">{it.name}</td>
          <td className="py-1 text-right tabular-nums">{fmt.format(it.forecastAmount)}</td>
          {hasActuals && (
            <td className="py-1 text-right tabular-nums text-slate-500">
              {it.actualAmount !== null ? fmt.format(it.actualAmount) : '—'}
            </td>
          )}
        </tr>
      ))}
      <tr className="border-b border-slate-200">
        <td className="py-1 pl-3 text-xs italic text-slate-500">Subtotal</td>
        <td className="py-1 text-right text-xs tabular-nums text-slate-500">{fmt.format(subTot)}</td>
        {hasActuals && <td className="py-1 text-right text-xs tabular-nums text-slate-500">{fmt.format(actualSubTot)}</td>}
      </tr>
    </>
  );
}
