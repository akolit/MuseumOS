import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Pencil, X, Check, Rows3, LayoutGrid, SlidersHorizontal,
  Book, CreditCard, Monitor, Gamepad2, Cpu, Newspaper,
  CircuitBoard, Boxes, Wrench, Mouse, Plug,
  MemoryStick, Disc, HardDrive, TerminalSquare,
  Smartphone, Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { CategoryFieldManager } from '@/components/category-field-manager';
import type { CategoryFieldSchema } from '@/lib/category-fields';

interface Category {
  id: string;
  code: string;
  nameEn: string;
  nameEl: string;
  idPrefix: string;
  sortOrder: number;
  schema?: CategoryFieldSchema | null;
}

type ViewMode = 'list' | 'grid';
const VIEW_MODE_KEY = 'categories-view-mode';

const CATEGORY_VISUAL: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  // In dark mode the icon goes a shade brighter (400) and the disc gets a
  // subtle inset ring in its own hue, so it reads as a crafted token on the
  // OLED background instead of a flat near-white circle.
  books:        { icon: Book,           color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-500/10 dark:ring-1 dark:ring-inset dark:ring-amber-400/20' },
  cards:        { icon: CreditCard,     color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10 dark:ring-1 dark:ring-inset dark:ring-emerald-400/20' },
  computers:    { icon: Monitor,        color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-500/10 dark:ring-1 dark:ring-inset dark:ring-blue-400/20' },
  consoles:     { icon: Gamepad2,       color: 'text-purple-600 dark:text-purple-400',   bg: 'bg-purple-50 dark:bg-purple-500/10 dark:ring-1 dark:ring-inset dark:ring-purple-400/20' },
  devices:      { icon: Smartphone,     color: 'text-cyan-600 dark:text-cyan-400',       bg: 'bg-cyan-50 dark:bg-cyan-500/10 dark:ring-1 dark:ring-inset dark:ring-cyan-400/20' },
  magazines:    { icon: Newspaper,      color: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-500/10 dark:ring-1 dark:ring-inset dark:ring-rose-400/20' },
  motherboards: { icon: CircuitBoard,   color: 'text-green-600 dark:text-green-400',     bg: 'bg-green-50 dark:bg-green-500/10 dark:ring-1 dark:ring-inset dark:ring-green-400/20' },
  others:       { icon: Boxes,          color: 'text-slate-600 dark:text-slate-300',     bg: 'bg-slate-50 dark:bg-slate-500/10 dark:ring-1 dark:ring-inset dark:ring-slate-400/20' },
  parts:        { icon: Wrench,         color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-500/10 dark:ring-1 dark:ring-inset dark:ring-orange-400/20' },
  peripherals:  { icon: Mouse,          color: 'text-indigo-600 dark:text-indigo-400',   bg: 'bg-indigo-50 dark:bg-indigo-500/10 dark:ring-1 dark:ring-inset dark:ring-indigo-400/20' },
  power_supply: { icon: Plug,           color: 'text-yellow-600 dark:text-yellow-400',   bg: 'bg-yellow-50 dark:bg-yellow-500/10 dark:ring-1 dark:ring-inset dark:ring-yellow-400/20' },
  processors:   { icon: Cpu,            color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-500/10 dark:ring-1 dark:ring-inset dark:ring-red-400/20' },
  rams:         { icon: MemoryStick,    color: 'text-pink-600 dark:text-pink-400',       bg: 'bg-pink-50 dark:bg-pink-500/10 dark:ring-1 dark:ring-inset dark:ring-pink-400/20' },
  software:     { icon: Disc,           color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-50 dark:bg-violet-500/10 dark:ring-1 dark:ring-inset dark:ring-violet-400/20' },
  storage:      { icon: HardDrive,      color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-50 dark:bg-sky-500/10 dark:ring-1 dark:ring-inset dark:ring-sky-400/20' },
  terminals:    { icon: TerminalSquare, color: 'text-teal-600 dark:text-teal-400',       bg: 'bg-teal-50 dark:bg-teal-500/10 dark:ring-1 dark:ring-inset dark:ring-teal-400/20' },
};

const FALLBACK_VISUAL = { icon: Package, color: 'text-muted-foreground', bg: 'bg-muted' };

export function CategoriesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [editNameEn, setEditNameEn] = useState('');
  const [editNameEl, setEditNameEl] = useState('');
  const [manageCat, setManageCat] = useState<Category | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'grid';
  });

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, nameEn, nameEl }: { id: string; nameEn: string; nameEl: string }) =>
      api.patch(`/categories/${id}`, { nameEn, nameEl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditId(null);
      toast.success(t('toast.saved'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  function startEdit(cat: Category) {
    setEditId(cat.id);
    setEditNameEn(cat.nameEn);
    setEditNameEl(cat.nameEl);
  }

  const { data: exhibitCounts } = useQuery({
    queryKey: ['category-counts'],
    queryFn: async () => {
      const cats = await api.get<Category[]>('/categories');
      const counts: Record<string, number> = {};
      await Promise.all(
        cats.map(async (cat) => {
          const res = await api.get<{ total: number }>(`/exhibits?categoryId=${cat.id}&limit=1`);
          counts[cat.id] = res.total;
        }),
      );
      return counts;
    },
  });

  function gotoCategory(cat: Category) {
    navigate(`/exhibits?categoryId=${cat.id}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('categories.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {categories ? t('categories.count', { count: categories.length }) : t('common.loading')}
          </p>
        </div>
        <div className="flex rounded-control border border-input">
          <button
            onClick={() => changeViewMode('list')}
            className={`rounded-l-control p-2 transition-colors ${
              viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
            title="List view"
          >
            <Rows3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => changeViewMode('grid')}
            className={`rounded-r-control p-2 transition-colors ${
              viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="mt-4">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {categories?.map((cat) => {
                const visual = CATEGORY_VISUAL[cat.code] ?? FALLBACK_VISUAL;
                const Icon = visual.icon;
                const count = exhibitCounts?.[cat.id];
                return (
                  <div key={cat.id} className="group relative flex">
                    <button
                      onClick={() => gotoCategory(cat)}
                      className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
                    >
                      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${visual.bg} transition-transform group-hover:scale-110`}>
                        <Icon className={`h-7 w-7 ${visual.color}`} />
                      </div>
                      <div className="mt-1">
                        <p className="font-medium leading-tight">{lang === 'el' ? cat.nameEl : cat.nameEn}</p>
                        <p className="text-xs text-muted-foreground">{lang === 'el' ? cat.nameEn : cat.nameEl}</p>
                      </div>
                      <div className="mt-auto flex items-center gap-1.5 pt-1">
                        <span className="font-mono text-[10px] text-muted-foreground">{cat.idPrefix}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                          {count ?? '...'}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => setManageCat(cat)}
                      title={t('categories.fields.manage') as string}
                      className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 font-medium">{t('categories.code')}</th>
              <th className="px-3 py-2.5 font-medium">{t('categories.idPrefix')}</th>
              <th className="px-3 py-2.5 font-medium">{t('categories.nameEn')}</th>
              <th className="px-3 py-2.5 font-medium">{t('categories.nameEl')}</th>
              <th className="px-3 py-2.5 font-medium text-right">{t('categories.exhibits')}</th>
              <th className="w-20 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : (
              categories?.map((cat) => {
                const visual = CATEGORY_VISUAL[cat.code] ?? FALLBACK_VISUAL;
                const Icon = visual.icon;
                return (
                <tr key={cat.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded ${visual.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${visual.color}`} />
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-primary">
                    <button onClick={() => gotoCategory(cat)} className="hover:underline">{cat.code}</button>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{cat.idPrefix}</td>
                  {editId === cat.id ? (
                    <>
                      <td className="px-3 py-1.5">
                        <input
                          value={editNameEn}
                          onChange={(e) => setEditNameEn(e.target.value)}
                          className="w-full rounded-control border border-input bg-background px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={editNameEl}
                          onChange={(e) => setEditNameEl(e.target.value)}
                          className="w-full rounded-control border border-input bg-background px-2 py-1 text-sm"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2">{cat.nameEn}</td>
                      <td className="px-3 py-2">{cat.nameEl}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">
                    <button onClick={() => gotoCategory(cat)} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20">
                      {exhibitCounts?.[cat.id] ?? '...'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editId === cat.id ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => updateMutation.mutate({ id: cat.id, nameEn: editNameEn, nameEl: editNameEl })}
                          className="rounded p-1 text-green-600 hover:bg-green-50"
                          disabled={updateMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditId(null)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setManageCat(cat)} title={t('categories.fields.manage') as string} className="rounded p-1 text-muted-foreground hover:bg-muted">
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => startEdit(cat)} title={t('common.edit') as string} className="rounded p-1 text-muted-foreground hover:bg-muted">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {manageCat && (
        <CategoryFieldManager
          category={manageCat}
          onClose={() => setManageCat(null)}
          onSaved={() => setManageCat(null)}
        />
      )}
    </div>
  );
}
