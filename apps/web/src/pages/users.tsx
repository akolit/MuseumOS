import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, KeyRound, X, Check, Shield, Eye, BookOpen, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { UsersRolesPanel } from './users-roles';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'viewer' | 'curator' | 'senior_curator' | 'admin';
  createdAt: string;
}

const ROLES = [
  { value: 'viewer', label: 'Viewer', icon: Eye },
  { value: 'curator', label: 'Curator', icon: BookOpen },
  { value: 'senior_curator', label: 'Senior Curator', icon: Shield },
  { value: 'admin', label: 'Admin', icon: Crown },
] as const;

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    senior_curator: 'bg-purple-100 text-purple-700',
    curator: 'bg-blue-100 text-blue-700',
    viewer: 'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = {
    admin: 'Admin',
    senior_curator: 'Senior Curator',
    curator: 'Curator',
    viewer: 'Viewer',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[role] ?? colors.viewer}`}>
      {labels[role] ?? role}
    </span>
  );
}

export function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ displayName: '', role: '' });
  const [newFields, setNewFields] = useState({ email: '', displayName: '', password: '', role: 'curator' });
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [tab, setTab] = useState<'users' | 'roles'>('users');

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newFields) => api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowAdd(false);
      setNewFields({ email: '', displayName: '', password: '', role: 'curator' });
      toast.success(t('toast.created'));
    },
    onError: (err: any) => toast.error(err?.message ?? t('toast.error')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; displayName: string; role: string }) =>
      api.patch(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditId(null);
      toast.success(t('toast.saved'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => {
      setResetId(null);
      setNewPassword('');
      toast.success(t('toast.passwordReset'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('users.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {tab === 'users'
              ? users ? t('users.count', { count: users.length }) : t('common.loading')
              : t('roles.matrix.subtitle')}
          </p>
        </div>
        {tab === 'users' && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('users.addUser')}
          </button>
        )}
      </div>

      {/* Tab switcher between the users list and the role-permissions matrix. */}
      <div className="mt-4 border-b border-border">
        <div className="flex gap-1">
          {(['users', 'roles'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(id === 'users' ? 'users.tabs.users' : 'users.tabs.roles')}
            </button>
          ))}
        </div>
      </div>

      {tab === 'roles' && <div className="mt-4"><UsersRolesPanel /></div>}

      {tab === 'users' && (<>
      {showAdd && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('common.email')} *</label>
              <input
                type="email"
                value={newFields.email}
                onChange={(e) => setNewFields({ ...newFields, email: e.target.value })}
                placeholder={t('common.emailPlaceholder') as string}
                className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('users.displayName')} *</label>
              <input
                value={newFields.displayName}
                onChange={(e) => setNewFields({ ...newFields, displayName: e.target.value })}
                placeholder={t('common.displayNamePlaceholder') as string}
                className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('common.password')} *</label>
              <input
                type="password"
                value={newFields.password}
                onChange={(e) => setNewFields({ ...newFields, password: e.target.value })}
                placeholder={t('users.passwordHint') as string}
                minLength={8}
                className={`w-full rounded-control border bg-background px-2 py-1.5 text-sm ${
                  newFields.password.length > 0 && newFields.password.length < 8
                    ? 'border-destructive'
                    : 'border-input'
                }`}
              />
              <p className={`mt-1 text-[11px] ${
                newFields.password.length > 0 && newFields.password.length < 8
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }`}>
                {t('users.passwordHint')}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('users.role')}</label>
              <select
                value={newFields.role}
                onChange={(e) => setNewFields({ ...newFields, role: e.target.value })}
                className="w-full rounded-control border border-input bg-background px-2 py-1.5 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                const { email, displayName, password } = newFields;
                if (email.trim() && displayName.trim() && password.trim()) {
                  createMutation.mutate(newFields);
                }
              }}
              disabled={!newFields.email.trim() || !newFields.displayName.trim() || newFields.password.length < 8 || createMutation.isPending}
              className="rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {t('users.addUser')}
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewFields({ email: '', displayName: '', password: '', role: 'curator' }); }}
              className="rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              {t('common.cancel')}
            </button>
          </div>
          {createMutation.error && (
            <p className="mt-2 text-xs text-destructive">
              {(createMutation.error as any)?.message ?? 'Failed to create user'}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-3 py-2.5 font-medium">{t('common.name')}</th>
              <th className="px-3 py-2.5 font-medium">{t('common.email')}</th>
              <th className="px-3 py-2.5 font-medium">{t('users.role')}</th>
              <th className="px-3 py-2.5 font-medium">{t('users.created')}</th>
              <th className="w-28 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{t('common.loading')}</td></tr>
            ) : users?.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No users</td></tr>
            ) : (
              users?.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  {editId === u.id ? (
                    <>
                      <td className="px-3 py-1.5">
                        <input
                          value={editFields.displayName}
                          onChange={(e) => setEditFields({ ...editFields, displayName: e.target.value })}
                          className="w-full rounded-control border border-input bg-background px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={editFields.role}
                          onChange={(e) => setEditFields({ ...editFields, role: e.target.value })}
                          className="rounded-control border border-input bg-background px-2 py-1 text-sm"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-medium">{u.displayName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-2"><RoleBadge role={u.role} /></td>
                    </>
                  )}
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editId === u.id ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => updateMutation.mutate({ id: u.id, ...editFields })}
                          className="rounded p-1 text-green-600 hover:bg-green-50"
                          disabled={updateMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditId(null)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : resetId === u.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={t('users.newPassword')}
                          className="w-32 rounded-control border border-input bg-background px-2 py-0.5 text-xs"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && newPassword.trim() && resetPasswordMutation.mutate({ id: u.id, password: newPassword.trim() })}
                        />
                        <button
                          onClick={() => newPassword.trim() && resetPasswordMutation.mutate({ id: u.id, password: newPassword.trim() })}
                          className="rounded p-1 text-green-600 hover:bg-green-50"
                          disabled={resetPasswordMutation.isPending}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => { setResetId(null); setNewPassword(''); }} className="rounded p-1 text-muted-foreground hover:bg-muted">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => { setEditId(u.id); setEditFields({ displayName: u.displayName, role: u.role }); }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setResetId(u.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          title={t('users.resetPassword')}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  );
}
