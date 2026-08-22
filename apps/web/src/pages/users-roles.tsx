import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, RotateCcw, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type Role = 'viewer' | 'curator' | 'senior_curator' | 'admin';
type Matrix = Record<Role, Record<string, boolean>>;

interface RolePermissionsResponse {
  matrix: Matrix;
  resources: { resource: string; verbs: string[] }[];
  allPermissions: string[];
}

const EDITABLE_ROLES: Role[] = ['viewer', 'curator', 'senior_curator'];
const ALL_ROLES: Role[] = [...EDITABLE_ROLES, 'admin'];

export function UsersRolesPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<RolePermissionsResponse>({
    queryKey: ['role-permissions'],
    queryFn: () => api.get<RolePermissionsResponse>('/role-permissions'),
  });

  // Local mutable copy. Stays in sync with the fetched data via the effect
  // below; user edits diverge it until they click Save (or Reset).
  const [local, setLocal] = useState<Matrix | null>(null);
  useEffect(() => {
    if (data) setLocal(structuredClone(data.matrix));
  }, [data]);

  const isDirty = useMemo(() => {
    if (!data || !local) return false;
    return EDITABLE_ROLES.some((role) =>
      data.allPermissions.some(
        (perm) => (data.matrix[role]?.[perm] ?? false) !== (local[role]?.[perm] ?? false),
      ),
    );
  }, [data, local]);

  const saveMutation = useMutation({
    mutationFn: (matrix: Matrix) => api.put('/role-permissions', { matrix }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
      toast.success(t('toast.saved'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  function toggle(role: Role, permission: string) {
    if (role === 'admin') return; // locked
    setLocal((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [role]: { ...prev[role], [permission]: !prev[role]?.[permission] } };
      return next;
    });
  }

  function reset() {
    if (data) setLocal(structuredClone(data.matrix));
  }

  if (isLoading || !data || !local) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('roles.matrix.help')}
      </p>

      <div className="overflow-x-auto rounded-control border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                {t('roles.matrix.permission')}
              </th>
              {ALL_ROLES.map((role) => (
                <th key={role} className="px-3 py-2 text-center font-medium">
                  <div className="inline-flex items-center gap-1.5">
                    {t(`roles.${role}`)}
                    {role === 'admin' && (
                      <Lock
                        className="h-3 w-3 text-muted-foreground"
                        aria-label={t('roles.matrix.adminLocked')}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.resources.flatMap((group) => [
              <tr key={`${group.resource}-header`} className="bg-muted/20">
                <td
                  colSpan={ALL_ROLES.length + 1}
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {t(`roles.resources.${group.resource}`, group.resource)}
                </td>
              </tr>,
              ...group.verbs.map((verb) => {
                const perm = `${group.resource}:${verb}`;
                return (
                  <tr key={perm} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-muted-foreground">{verb}</span>
                    </td>
                    {ALL_ROLES.map((role) => (
                      <td key={role} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!local[role]?.[perm]}
                          disabled={role === 'admin'}
                          onChange={() => toggle(role, perm)}
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`${role} ${perm}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('roles.matrix.applyNote')}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={!isDirty || saveMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-control border border-input bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('common.reset')}
          </button>
          <button
            type="button"
            onClick={() => local && saveMutation.mutate(local)}
            disabled={!isDirty || saveMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
