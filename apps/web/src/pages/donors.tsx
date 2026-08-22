import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, ArrowUp, ArrowDown, MapPin, Mail, Phone, Download, X, Save, Loader2, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

interface Donor {
  id: string;
  name: string;
  fatherName: string | null;
  address: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  comment: string | null;
  legacyId: string | null;
  firstDonationAt: string | null;
  _count?: { exhibits: number };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type SortKey = 'name' | 'exhibits' | 'city' | 'legacyId' | 'firstDonationAt';
type SortDir = 'asc' | 'desc';

interface NewDonorForm {
  name: string;
  fatherName: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  taxId: string;
  comment: string;
  firstDonationAt: string;
  isPublic: boolean;
}

const EMPTY_DONOR: NewDonorForm = {
  name: '', fatherName: '', address: '', city: '', phone: '', email: '',
  taxId: '', comment: '', firstDonationAt: '', isPublic: true,
};

// Trim, blank → null, and turn the date input into an ISO timestamp, mirroring
// the donor-detail edit form so create and update stay consistent.
function newDonorToPayload(form: NewDonorForm) {
  return {
    name: form.name.trim(),
    fatherName: form.fatherName.trim() || null,
    address: form.address.trim() || null,
    city: form.city.trim() || null,
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    taxId: form.taxId.trim() || null,
    comment: form.comment.trim() || null,
    firstDonationAt: form.firstDonationAt
      ? new Date(form.firstDonationAt + 'T00:00:00Z').toISOString()
      : null,
    isPublic: form.isPublic,
  };
}

function SortHeader({ label, sortKey, current, direction, onSort, className }: {
  label: string; sortKey: SortKey; current: SortKey; direction: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2.5 font-medium transition-colors hover:text-primary ${className ?? ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3 opacity-0 group-hover:opacity-30" />
        )}
      </span>
    </th>
  );
}

export function DonorsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newDonor, setNewDonor] = useState<NewDonorForm>(EMPTY_DONOR);
  // Donation forms staged in the modal — uploaded right after the donor is
  // created (the upload endpoint needs the new donor's id).
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const [addDragOver, setAddDragOver] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const { user } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const { data: donors, isLoading } = useQuery({
    queryKey: ['donors'],
    queryFn: () => api.get<Donor[]>('/donors'),
  });

  const createMutation = useMutation({
    mutationFn: async (args: { payload: ReturnType<typeof newDonorToPayload>; files: File[] }) => {
      const created = await api.post<{ id: string }>('/donors', args.payload);
      // Upload staged donation forms now that we have the donor id. A failure
      // here doesn't undo the donor — surface it but still open the profile so
      // the operator can retry the upload there.
      let uploadError: string | null = null;
      if (args.files.length > 0) {
        try {
          const fd = new FormData();
          args.files.forEach((f) => fd.append('files', f));
          const res = await fetch(`/api/donors/${created.id}/files`, {
            method: 'POST',
            body: fd,
            credentials: 'include',
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message ?? `Upload failed (${res.status})`);
          }
        } catch (e: any) {
          uploadError = e?.message ?? t('toast.uploadFailed');
        }
      }
      return { created, uploadError };
    },
    onSuccess: ({ created, uploadError }) => {
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      setShowAdd(false);
      setNewDonor(EMPTY_DONOR);
      setNewFiles([]);
      toast.success(t('toast.created'));
      if (uploadError) toast.error(uploadError);
      navigate(`/donors/${created.id}`);
    },
    // Surface the API message (e.g. a duplicate-name collision) so the user
    // knows why the create was rejected.
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('asc'); }
  }

  // Filter against name, city, and email — the most useful fields to search.
  const sorted = useMemo(() => {
    const q = search.toLowerCase();
    const list = donors?.filter((d) =>
      d.name.toLowerCase().includes(q)
      || (d.city ?? '').toLowerCase().includes(q)
      || (d.email ?? '').toLowerCase().includes(q),
    ) ?? [];
    return list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'exhibits') cmp = (a._count?.exhibits ?? 0) - (b._count?.exhibits ?? 0);
      else if (sortBy === 'city') cmp = (a.city ?? '').localeCompare(b.city ?? '');
      else if (sortBy === 'legacyId') cmp = Number(a.legacyId ?? 0) - Number(b.legacyId ?? 0);
      else if (sortBy === 'firstDonationAt') cmp = (a.firstDonationAt ?? '').localeCompare(b.firstDonationAt ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [donors, search, sortBy, sortDir]);

  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [exportOpen]);

  // Exports the currently shown (filtered + sorted) donors. taxId is PII, so it
  // is only included for admins — matching the profile view's gating.
  function exportData(format: 'csv' | 'json') {
    setExportOpen(false);
    const isAdmin = user?.role === 'admin';
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `donors_${stamp}_${sorted.length}`;
    const cols = [
      'legacyId', 'name', 'fatherName', 'address', 'city', 'phone', 'email',
      ...(isAdmin ? ['taxId'] : []), 'comment', 'firstDonationAt', 'exhibits',
    ] as const;
    const valueOf = (d: Donor, c: string): unknown =>
      c === 'exhibits' ? (d._count?.exhibits ?? 0) : (d as unknown as Record<string, unknown>)[c];

    if (format === 'json') {
      const data = sorted.map((d) => Object.fromEntries(cols.map((c) => [c, valueOf(d, c) ?? null])));
      downloadBlob(JSON.stringify(data, null, 2), `${base}.json`, 'application/json');
      return;
    }
    const lines = sorted.map((d) => cols.map((c) => csvEscape(valueOf(d, c))).join(','));
    // BOM so Excel reads UTF-8 (Greek) correctly.
    const csv = '﻿' + [cols.join(','), ...lines].join('\r\n') + '\r\n';
    downloadBlob(csv, `${base}.csv`, 'text/csv;charset=utf-8');
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('donors.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {donors ? t('donors.count', { count: donors.length }) : t('common.loading')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportOpen((o) => !o)}
              disabled={!sorted.length}
              title={t('donors.export') as string}
              className="flex items-center gap-1.5 rounded-control border border-input px-3 py-2 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {t('donors.export')}
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                  {t('donors.exportCount', { count: sorted.length })}
                </div>
                <button onClick={() => exportData('csv')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="font-mono text-xs text-primary">CSV</span>
                  <span>{t('donors.exportCsv')}</span>
                </button>
                <button onClick={() => exportData('json')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="font-mono text-xs text-primary">JSON</span>
                  <span>{t('donors.exportJson')}</span>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => { setNewDonor(EMPTY_DONOR); setNewFiles([]); setShowAdd(true); }}
            className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('donors.addDonor')}
          </button>
        </div>
      </div>

      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('donors.filterPlaceholder')}
          className="w-full rounded-control border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none ring-ring focus:ring-2"
        />
      </div>

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !createMutation.isPending && setShowAdd(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (newDonor.name.trim() && !createMutation.isPending) {
                createMutation.mutate({ payload: newDonorToPayload(newDonor), files: newFiles });
              }
            }}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-display text-base font-semibold">{t('donors.addDonor')}</h2>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('common.name')} *</label>
                  <input
                    value={newDonor.name}
                    onChange={(e) => setNewDonor({ ...newDonor, name: e.target.value })}
                    className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm"
                    required
                    maxLength={300}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('donors.fatherName')}</label>
                  <input value={newDonor.fatherName} onChange={(e) => setNewDonor({ ...newDonor, fatherName: e.target.value })} className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm" maxLength={300} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('donors.firstDonation')}</label>
                  <input type="date" value={newDonor.firstDonationAt} onChange={(e) => setNewDonor({ ...newDonor, firstDonationAt: e.target.value })} className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('donors.address')}</label>
                  <input value={newDonor.address} onChange={(e) => setNewDonor({ ...newDonor, address: e.target.value })} className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm" maxLength={500} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('donors.city')}</label>
                  <input value={newDonor.city} onChange={(e) => setNewDonor({ ...newDonor, city: e.target.value })} className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm" maxLength={200} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('donors.phone')}</label>
                  <input value={newDonor.phone} onChange={(e) => setNewDonor({ ...newDonor, phone: e.target.value })} className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm" maxLength={50} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('donors.email')}</label>
                  <input type="email" value={newDonor.email} onChange={(e) => setNewDonor({ ...newDonor, email: e.target.value })} className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm" maxLength={300} />
                </div>
                {user?.role === 'admin' && (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t('donors.taxId')}
                      <span className="ml-1 font-normal text-muted-foreground/70">({t('donors.adminOnly')})</span>
                    </label>
                    <input value={newDonor.taxId} onChange={(e) => setNewDonor({ ...newDonor, taxId: e.target.value })} className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm" maxLength={50} />
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('donors.notes')}</label>
                  <textarea value={newDonor.comment} onChange={(e) => setNewDonor({ ...newDonor, comment: e.target.value })} className="w-full resize-y rounded-control border border-input bg-background px-3 py-2 text-sm" rows={3} maxLength={5000} />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('donors.donationForms')}</label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setAddDragOver(true); }}
                    onDragLeave={() => setAddDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setAddDragOver(false); setNewFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]); }}
                    className={`flex flex-col items-center gap-1.5 rounded-control border-2 border-dashed p-4 text-center transition-colors ${addDragOver ? 'border-primary bg-primary/5' : 'border-input'}`}
                  >
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <div className="text-sm">
                      <button type="button" onClick={() => newFileInputRef.current?.click()} className="font-medium text-primary hover:underline">
                        {t('donors.clickToUpload')}
                      </button>{' '}{t('donors.uploadHint')}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('donors.uploadFormats')}</p>
                    <input
                      ref={newFileInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => { const fs = Array.from(e.target.files ?? []); setNewFiles((prev) => [...prev, ...fs]); e.target.value = ''; }}
                    />
                  </div>
                  {newFiles.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {newFiles.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-control border border-border bg-muted/40 px-2 py-1 text-xs">
                          <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{f.name}</span>
                          <span className="flex-shrink-0 text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                          <button
                            type="button"
                            onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newDonor.isPublic}
                      onChange={(e) => setNewDonor({ ...newDonor, isPublic: e.target.checked })}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="font-medium">{t('donors.shownInSite')}</span>
                    <span className="text-xs text-muted-foreground">{t('donors.shownInSiteHint')}</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!newDonor.name.trim() || createMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <SortHeader label={t('donors.legacyIdShort')} sortKey="legacyId" current={sortBy} direction={sortDir} onSort={toggleSort} className="w-20" />
              <SortHeader label={t('common.name')} sortKey="name" current={sortBy} direction={sortDir} onSort={toggleSort} />
              <SortHeader label={t('donors.city')} sortKey="city" current={sortBy} direction={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2.5 font-medium">{t('donors.contact')}</th>
              <SortHeader label={t('donors.firstDonation')} sortKey="firstDonationAt" current={sortBy} direction={sortDir} onSort={toggleSort} />
              <SortHeader label={t('donors.exhibits')} sortKey="exhibits" current={sortBy} direction={sortDir} onSort={toggleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{t('common.loading')}</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{t('donors.noDonors')}</td></tr>
            ) : (
              sorted.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/donors/${d.id}`)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                  title={t('donors.openProfile', { name: d.name }) as string}
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {d.legacyId ? `#${d.legacyId}` : '—'}
                  </td>
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {d.city && (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <MapPin className="h-3 w-3 opacity-60" />
                        {d.city}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      {d.email && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 opacity-60" />
                          {d.email}
                        </span>
                      )}
                      {d.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3 opacity-60" />
                          {d.phone}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {d.firstDonationAt ? new Date(d.firstDonationAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {d._count?.exhibits ?? 0}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
