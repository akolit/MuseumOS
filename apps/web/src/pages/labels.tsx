import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '@/lib/api';

interface Exhibit {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  year: number | null;
}

const LABELS_PER_PAGE = 24; // 3 columns × 8 rows on A4
const COLS = 3;

export function LabelsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ids = useMemo(() => (searchParams.get('ids') ?? '').split(',').filter(Boolean), [searchParams]);
  const [skip, setSkip] = useState(0);

  // One bulk POST request — avoids the per-request rate limit when printing
  // labels for hundreds of exhibits in one go.
  const { data: exhibits = [], isLoading: loading } = useQuery({
    queryKey: ['labels-lookup', ids.join(',')],
    queryFn: () => api.post<Exhibit[]>('/exhibits/lookup', { ids }),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

  // For partial label sheets — pad with empty slots at the start.
  const slots: (Exhibit | null)[] = [
    ...Array(skip).fill(null),
    ...exhibits,
  ];
  // Pad the last page with empty slots so the grid stays aligned.
  const remainder = slots.length % LABELS_PER_PAGE;
  if (remainder !== 0) {
    const padding = LABELS_PER_PAGE - remainder;
    slots.push(...Array(padding).fill(null));
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .label-page { page-break-after: always; }
          .label-page:last-child { page-break-after: auto; }
        }
        .label-page {
          width: 194mm;
          height: 281mm;
          padding: 4mm;
          display: grid;
          grid-template-columns: repeat(${COLS}, 1fr);
          grid-auto-rows: 34mm;
          gap: 2mm;
        }
        .label {
          display: flex;
          align-items: center;
          gap: 3mm;
          padding: 2mm;
          border: 0.3mm solid #888;
          border-radius: 2mm;
          page-break-inside: avoid;
          background: white;
          overflow: hidden;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>

      <div className="mx-auto max-w-6xl">
        {/* Toolbar (hidden when printing) */}
        <div className="no-print mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              // Prefer browser history (returns to whichever page launched the
              // labels view — usually a single exhibit detail or the list).
              // Falls back to /exhibits if there's no prior history entry.
              if (window.history.length > 1) navigate(-1);
              else navigate('/exhibits');
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t('common.back')}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t('labels.skip')}
              <input
                type="number"
                min={0}
                max={LABELS_PER_PAGE - 1}
                value={skip}
                onChange={(e) => setSkip(Math.max(0, Math.min(LABELS_PER_PAGE - 1, Number(e.target.value))))}
                className="w-16 rounded border border-input bg-background px-2 py-1 text-sm"
              />
            </label>
            <button
              onClick={() => window.print()}
              disabled={loading || exhibits.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" /> {t('labels.print')}
            </button>
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {!loading && exhibits.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('labels.noExhibits')}</p>
        )}

        {/* Pages */}
        {!loading && exhibits.length > 0 && (
          <div className="space-y-4">
            {Array.from({ length: Math.ceil(slots.length / LABELS_PER_PAGE) }).map((_, p) => {
              const pageSlots = slots.slice(p * LABELS_PER_PAGE, (p + 1) * LABELS_PER_PAGE);
              return (
                <div key={p} className="label-page mx-auto bg-white shadow-sm">
                  {pageSlots.map((ex, i) => (
                    <div key={i} className={ex ? 'label' : ''}>
                      {ex && (
                        <>
                          <QRCodeSVG
                            value={`${origin}/exhibits/${ex.id}`}
                            size={96}
                            level="M"
                            className="flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1 text-[10px] leading-tight">
                            <div className="font-mono font-bold">{ex.displayId}</div>
                            <div className="font-semibold line-clamp-2">{ex.exhibitName}</div>
                            <div className="text-muted-foreground line-clamp-1">
                              {ex.manufacturer ?? ''}
                              {ex.manufacturer && ex.year ? ' · ' : ''}
                              {ex.year ?? ''}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

