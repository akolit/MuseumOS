import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Trash2, FileText, RotateCw, RotateCcw, ExternalLink, FileIcon } from 'lucide-react';
import { api } from '@/lib/api';

export interface DonorFile {
  id: string;
  donorId: string;
  originalFilename: string | null;
  mimeType: string | null;
  bytes: number | null;
  caption: string | null;
  position: number;
  isImage: boolean;
  url: string;
  thumbUrl: string | null;
  uploadedAt: string;
  uploadedBy: { id: string; displayName: string } | null;
}

function humanSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DonorFileManager({
  donorId,
  files,
  onRefresh,
  canWrite,
}: {
  donorId: string;
  files: DonorFile[];
  onRefresh: () => void;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(fileList)) fd.append('files', f);
      const res = await fetch(`/api/donors/${donorId}/files`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Upload failed (${res.status})`);
      }
      await onRefresh();
    } catch (err: any) {
      setError(err.message ?? t('toast.uploadFailed'));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function rotate(fileId: string, direction: 'cw' | 'ccw') {
    setBusy(true); setError(null);
    try {
      await api.post(`/donors/${donorId}/files/${fileId}/rotate`, { direction });
      await onRefresh();
    } catch (err: any) { setError(err.message ?? t('toast.error')); }
    finally { setBusy(false); }
  }

  async function deleteFile(fileId: string) {
    setBusy(true); setError(null);
    try {
      await api.delete(`/donors/${donorId}/files/${fileId}`);
      setConfirmDelete(null);
      await onRefresh();
    } catch (err: any) { setError(err.message ?? t('toast.deleteFailed')); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {canWrite && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-input'
          }`}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="font-medium text-primary hover:underline"
              disabled={busy}
            >
              {t('donors.clickToUpload')}
            </button>
            {' '}{t('donors.uploadHint')}
          </div>
          <p className="text-xs text-muted-foreground">{t('donors.uploadFormats')}</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {files.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-muted"
            >
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                title={file.originalFilename ?? t('donors.openFile')}
                className="relative block"
              >
                {file.thumbUrl && !broken.has(file.id) ? (
                  <>
                    <img
                      src={file.thumbUrl}
                      alt={file.originalFilename ?? ''}
                      loading="lazy"
                      decoding="async"
                      onError={() => setBroken((s) => new Set(s).add(file.id))}
                      className="aspect-square w-full bg-white object-cover"
                    />
                    {!file.isImage && (
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                        PDF
                      </span>
                    )}
                  </>
                ) : (
                  <div className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                    <FileText className="h-9 w-9" />
                    <span className="px-2 text-[10px] uppercase tracking-wide">
                      {file.mimeType === 'application/pdf' ? 'PDF' : t('donors.file')}
                    </span>
                  </div>
                )}
              </a>

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 p-1.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('donors.openFile') as string}
                  className="rounded bg-white/10 p-1 text-white hover:bg-white/20"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {canWrite && (
                  <div className="flex gap-0.5">
                    {file.isImage && (
                      <>
                        <button
                          type="button"
                          title={t('exhibit.rotateCcw') as string}
                          disabled={busy}
                          onClick={() => rotate(file.id, 'ccw')}
                          className="rounded bg-white/10 p-1 text-white hover:bg-white/20"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={t('exhibit.rotateCw') as string}
                          disabled={busy}
                          onClick={() => rotate(file.id, 'cw')}
                          className="rounded bg-white/10 p-1 text-white hover:bg-white/20"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      title={t('common.delete') as string}
                      disabled={busy}
                      onClick={() => setConfirmDelete(file.id)}
                      className="rounded bg-white/10 p-1 text-white hover:bg-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {(file.originalFilename || file.bytes) && (
                <div className="truncate border-t border-border bg-card px-2 py-1 text-[11px] text-muted-foreground" title={file.originalFilename ?? ''}>
                  {file.originalFilename ?? t('donors.file')}
                  {file.bytes ? ` · ${humanSize(file.bytes)}` : ''}
                </div>
              )}

              {confirmDelete === file.id && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-2 text-white">
                  <p className="text-center text-xs">{t('donors.deleteFile')}</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => deleteFile(file.id)}
                      disabled={busy}
                      className="rounded bg-red-500 px-2 py-1 text-xs hover:bg-red-600"
                    >
                      {t('common.delete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      className="rounded bg-white/20 px-2 py-1 text-xs hover:bg-white/30"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileIcon className="h-4 w-4" /> {t('donors.noFiles')}
        </p>
      )}
    </div>
  );
}
