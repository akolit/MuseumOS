import { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Pencil, Save, X, Loader2, MapPin, Mail, Phone, User,
  Hash, Calendar, MessageSquare, Building, FileText, Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { DonorFileManager, type DonorFile } from '@/components/donor-file-manager';

interface Donor {
  id: string;
  name: string;
  fatherName: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  comment: string | null;
  firstDonationAt: string | null;
  legacyId: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { exhibits: number };
}

interface ExhibitRow {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  year: number | null;
  acquiredAt: string | null;
  category: { code: string; nameEn: string; nameEl: string };
  primaryThumbnailUrl: string | null;
}

interface SearchResult { items: ExhibitRow[]; total: number; pages: number }

export function DonorDetailPage() {
  const { t, i18n } = useTranslation();
  const isEl = i18n.language.startsWith('el');
  const { id } = useParams<{ id: string }>();
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  // taxId is PII; only show to admins.
  const canSeePII = user?.role === 'admin';
  const canWrite = hasPermission('donor:write');

  const { data: donor, isLoading, error } = useQuery({
    queryKey: ['donor', id],
    queryFn: () => api.get<Donor>(`/donors/${id}`),
    enabled: !!id,
  });

  // Exhibits donated by this donor. The exhibits list endpoint is a GET
  // with query params and caps at limit=100. Donors with >100 are rare
  // (Intracom Telecom in the import had 112 — the rest will be one click
  // away via "Open in main list").
  const { data: exhibits } = useQuery({
    queryKey: ['donor-exhibits', id],
    queryFn: () => {
      const p = new URLSearchParams({
        donorId: id!,
        page: '1',
        limit: '100',
        sortBy: 'displayId',
        sortOrder: 'asc',
      });
      return api.get<SearchResult>(`/exhibits?${p.toString()}`);
    },
    enabled: !!id,
  });

  // Donor files — scanned donation forms, photos, PDFs.
  const { data: donorFiles } = useQuery({
    queryKey: ['donor-files', id],
    queryFn: () => api.get<DonorFile[]>(`/donors/${id}/files`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error || !donor) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <p className="mt-8 text-center text-sm text-muted-foreground">{t('donors.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <BackLink />
        {canWrite && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-control border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('common.edit')}
          </button>
        )}
      </div>

      {/* Header — name + legacy id + donation count */}
      <div className="mb-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold">{donor.name}</h1>
            <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              {donor.legacyId && (
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {donor.legacyId}
                </span>
              )}
              <span>
                {t('donors.exhibitsDonatedCount', { count: donor._count?.exhibits ?? 0 })}
              </span>
            </p>
          </div>
        </div>
      </div>

      {editing ? (
        <DonorEditForm
          donor={donor}
          canSeePII={canSeePII}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['donor', id] });
            queryClient.invalidateQueries({ queryKey: ['donors'] });
            setEditing(false);
          }}
        />
      ) : (
        <DonorProfile donor={donor} canSeePII={canSeePII} />
      )}

      {/* Donation forms / files */}
      <div className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t('donors.donationForms')}
          </h2>
          {donorFiles && donorFiles.length > 0 && (
            <span className="text-xs text-muted-foreground">{donorFiles.length}</span>
          )}
        </div>
        <div className="p-5">
          {!donorFiles ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <DonorFileManager
              donorId={donor.id}
              files={donorFiles}
              canWrite={canWrite}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: ['donor-files', id] })}
            />
          )}
        </div>
      </div>

      {/* Exhibits donated */}
      <div className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-display text-base font-semibold">{t('donors.exhibitsDonated')}</h2>
          {exhibits && exhibits.total > 0 && (
            <Link
              to={`/exhibits?donorId=${donor.id}`}
              className="text-xs text-primary hover:underline"
            >
              {t('donors.openInList')}
            </Link>
          )}
        </div>
        {!exhibits ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : exhibits.items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('donors.noExhibits')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {exhibits.items.map((ex) => (
              <li key={ex.id}>
                <Link
                  to={`/exhibits/${ex.id}`}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/30"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {ex.primaryThumbnailUrl ? (
                      <img src={ex.primaryThumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs font-bold text-primary">{ex.displayId}</span>
                      <span className="truncate text-sm font-medium">{ex.exhibitName}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {isEl ? ex.category.nameEl : ex.category.nameEn}
                      {ex.manufacturer && ` · ${ex.manufacturer}`}
                      {ex.year && ` · ${ex.year}`}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right text-xs text-muted-foreground">
                    {ex.acquiredAt && new Date(ex.acquiredAt).toLocaleDateString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  function BackLink() {
    return (
      <Link
        to="/donors"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('donors.backToDonors')}
      </Link>
    );
  }
}

function DonorProfile({ donor, canSeePII }: { donor: Donor; canSeePII: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <ProfileField icon={Globe} label={t('donors.shownInSite')}
        value={donor.isPublic ? (t('common.yes') as string) : (t('common.no') as string)} />
      <ProfileField icon={User} label={t('donors.fatherName')} value={donor.fatherName} />
      <ProfileField icon={Calendar} label={t('donors.firstDonation')}
        value={donor.firstDonationAt ? new Date(donor.firstDonationAt).toLocaleDateString() : null} />
      <ProfileField icon={Building} label={t('donors.address')} value={donor.address} />
      <ProfileField icon={MapPin} label={t('donors.city')} value={donor.city} />
      <ProfileField icon={Phone} label={t('donors.phone')} value={donor.phone}
        renderValue={(v) => <a href={`tel:${v}`} className="text-foreground hover:underline">{v}</a>} />
      <ProfileField icon={Mail} label={t('donors.email')} value={donor.email}
        renderValue={(v) => <a href={`mailto:${v}`} className="text-foreground hover:underline">{v}</a>} />
      {canSeePII && (
        <ProfileField icon={Hash} label={t('donors.taxId')} value={donor.taxId}
          hint={t('donors.adminOnly') as string} />
      )}
      {donor.comment && (
        <div className="md:col-span-2">
          <ProfileField icon={MessageSquare} label={t('donors.notes')} value={donor.comment} multiline />
        </div>
      )}
    </div>
  );
}

function ProfileField({
  icon: Icon, label, value, renderValue, multiline, hint,
}: {
  icon: typeof User;
  label: string;
  value: string | null;
  renderValue?: (v: string) => React.ReactNode;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
        {hint && <span className="ml-1 normal-case font-normal text-muted-foreground/70">({hint})</span>}
      </div>
      {value
        ? (
          <p className={`text-sm ${multiline ? 'whitespace-pre-wrap' : ''}`}>
            {renderValue ? renderValue(value) : value}
          </p>
        )
        : <p className="text-sm italic text-muted-foreground/60">—</p>}
    </div>
  );
}

interface EditForm {
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

function donorToForm(d: Donor): EditForm {
  return {
    name: d.name,
    fatherName: d.fatherName ?? '',
    address: d.address ?? '',
    city: d.city ?? '',
    phone: d.phone ?? '',
    email: d.email ?? '',
    taxId: d.taxId ?? '',
    comment: d.comment ?? '',
    firstDonationAt: d.firstDonationAt ? d.firstDonationAt.slice(0, 10) : '',
    isPublic: d.isPublic ?? true,
  };
}

function formToPayload(form: EditForm) {
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

function DonorEditForm({
  donor, canSeePII, onCancel, onSaved,
}: {
  donor: Donor;
  canSeePII: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<EditForm>(() => donorToForm(donor));

  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      api.patch(`/donors/${donor.id}`, payload),
    onSuccess: () => {
      toast.success(t('toast.saved'));
      onSaved();
    },
    onError: (err: any) => {
      // Surface name-collision from the API distinctly so the user knows
      // why the save was rejected.
      toast.error(err?.message ?? t('toast.error'));
    },
  });

  const canSubmit = useMemo(
    () => form.name.trim().length > 0 && !mutation.isPending,
    [form.name, mutation.isPending],
  );

  const inputCls = 'w-full rounded-control border border-input bg-background px-3 py-2 text-sm';
  const labelCls = 'mb-1 block text-xs font-medium text-muted-foreground';

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate(formToPayload(form)); }}
      className="rounded-lg border border-border bg-card p-5"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className={labelCls}>{t('common.name')} *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required maxLength={300} />
        </div>
        <div>
          <label className={labelCls}>{t('donors.fatherName')}</label>
          <input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} className={inputCls} maxLength={300} />
        </div>
        <div>
          <label className={labelCls}>{t('donors.firstDonation')}</label>
          <input type="date" value={form.firstDonationAt} onChange={(e) => setForm({ ...form, firstDonationAt: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('donors.address')}</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} maxLength={500} />
        </div>
        <div>
          <label className={labelCls}>{t('donors.city')}</label>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} maxLength={200} />
        </div>
        <div>
          <label className={labelCls}>{t('donors.phone')}</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} maxLength={50} />
        </div>
        <div>
          <label className={labelCls}>{t('donors.email')}</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} maxLength={300} />
        </div>
        {canSeePII && (
          <div className="md:col-span-2">
            <label className={labelCls}>
              {t('donors.taxId')}
              <span className="ml-1 font-normal text-muted-foreground/70">({t('donors.adminOnly')})</span>
            </label>
            <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className={inputCls} maxLength={50} />
          </div>
        )}
        <div className="md:col-span-2">
          <label className={labelCls}>{t('donors.notes')}</label>
          <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} className={`${inputCls} resize-y`} rows={3} maxLength={5000} />
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className="font-medium">{t('donors.shownInSite')}</span>
            <span className="text-xs text-muted-foreground">{t('donors.shownInSiteHint')}</span>
          </label>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
          <X className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}
