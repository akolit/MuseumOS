import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Map, Plus, Minus, Trash2, Search, Eye, Pencil, Upload, X,
  ZoomIn, ZoomOut, RotateCw, Archive,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────

interface FloorPlanSummary {
  id: string;
  name: string;
  svgStorageKey: string;
  imageUrl: string;
  placementCount: number;
}

interface PlacementExhibit {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  year: number | null;
  category: { code: string; nameEn: string; nameEl: string };
  primaryImageUrl: string | null;
}

interface Placement {
  id: string;
  exhibitId: string;
  x: number;
  y: number;
  rotation: number;
  scale?: number;
  exhibit: PlacementExhibit;
}

interface FloorPlanDetail {
  id: string;
  name: string;
  svgStorageKey: string;
  imageUrl: string;
  calibrationJson: Record<string, unknown> | null;
  placements: Placement[];
}

interface ExhibitSearchResult {
  id: string;
  displayId: string;
  exhibitName: string;
  manufacturer: string | null;
  categoryCode: string;
  categoryNameEn: string;
  categoryNameEl: string;
}

// ── Canvas state ─────────────────────────────────────────────

interface Transform {
  x: number;
  y: number;
  scale: number;
}

// ── Component ────────────────────────────────────────────────

export function FloorPlanPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const isEl = i18n.language === 'el';

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [selectedPlacement, setSelectedPlacement] = useState<Placement | null>(null);
  const [showNewPlanInput, setShowNewPlanInput] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');

  // ── Queries ──────────────────────────────────────────────

  const plansQuery = useQuery({
    queryKey: ['floor-plans'],
    queryFn: () => api.get<FloorPlanSummary[]>('/floor-plans'),
  });

  const planDetailQuery = useQuery({
    queryKey: ['floor-plan', selectedPlanId],
    queryFn: () => api.get<FloorPlanDetail>(`/floor-plans/${selectedPlanId}`),
    enabled: !!selectedPlanId,
  });

  const plans = plansQuery.data ?? [];
  const detail = planDetailQuery.data;

  useEffect(() => {
    if (plans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plans[0]!.id);
    }
  }, [plans, selectedPlanId]);

  useEffect(() => {
    if (!selectedPlacement || !detail) return;
    const fresh = detail.placements.find((p) => p.id === selectedPlacement.id);
    if (fresh && (fresh.x !== selectedPlacement.x || fresh.y !== selectedPlacement.y || fresh.rotation !== selectedPlacement.rotation || fresh.scale !== selectedPlacement.scale)) {
      setSelectedPlacement(fresh);
    }
  }, [detail, selectedPlacement]);

  // ── Mutations ────────────────────────────────────────────

  const createPlan = useMutation({
    mutationFn: (name: string) => api.post<{ id: string }>('/floor-plans', { name }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['floor-plans'] });
      setSelectedPlanId(data.id);
      setShowNewPlanInput(false);
      setNewPlanName('');
      toast.success(t('toast.created'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const deletePlan = useMutation({
    mutationFn: (id: string) => api.delete(`/floor-plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-plans'] });
      setSelectedPlanId(null);
      setSelectedPlacement(null);
      toast.success(t('toast.deleted'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const uploadImage = useMutation({
    mutationFn: async ({ planId, file }: { planId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/floor-plans/${planId}/image`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-plan', selectedPlanId] });
      qc.invalidateQueries({ queryKey: ['floor-plans'] });
    },
  });

  const upsertPlacement = useMutation({
    mutationFn: ({ planId, ...input }: { planId: string; exhibitId: string; x: number; y: number; rotation: number; scale: number }) =>
      api.post(`/floor-plans/${planId}/placements`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-plan', selectedPlanId] });
      qc.invalidateQueries({ queryKey: ['floor-plans'] });
    },
  });

  const removePlacement = useMutation({
    mutationFn: ({ planId, exhibitId }: { planId: string; exhibitId: string }) =>
      api.delete(`/floor-plans/${planId}/placements/${exhibitId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-plan', selectedPlanId] });
      qc.invalidateQueries({ queryKey: ['floor-plans'] });
      setSelectedPlacement(null);
    },
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left sidebar — plan list + exhibit search */}
      <PlanSidebar
        plans={plans}
        selectedPlanId={selectedPlanId}
        onSelect={(id) => { setSelectedPlanId(id); setSelectedPlacement(null); }}
        showNewPlanInput={showNewPlanInput}
        newPlanName={newPlanName}
        onNewPlanNameChange={setNewPlanName}
        onToggleNew={() => setShowNewPlanInput(!showNewPlanInput)}
        onCreatePlan={() => newPlanName.trim() && createPlan.mutate(newPlanName.trim())}
        mode={mode}
        isEl={isEl}
        planId={selectedPlanId}
        onPlaceExhibit={(exhibitId) => {
          if (!selectedPlanId) return;
          upsertPlacement.mutate({
            planId: selectedPlanId,
            exhibitId,
            x: 0.5,
            y: 0.5,
            rotation: 0,
            scale: 1,
          });
        }}
      />

      {/* Center — canvas */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        {detail && (
          <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
            <h2 className="mr-auto text-sm font-semibold">{detail.name}</h2>

            <span className="mr-2 text-xs text-muted-foreground">
              {detail.placements.length} {t('floorPlan.placements')}
            </span>

            <div className="flex rounded-lg border border-border">
              <button
                onClick={() => setMode('view')}
                className={`flex items-center gap-1 px-3 py-1 text-xs ${mode === 'view' ? 'bg-primary text-primary-foreground' : ''}`}
              >
                <Eye className="h-3 w-3" /> {t('floorPlan.view')}
              </button>
              <button
                onClick={() => setMode('edit')}
                className={`flex items-center gap-1 px-3 py-1 text-xs ${mode === 'edit' ? 'bg-primary text-primary-foreground' : ''}`}
              >
                <Pencil className="h-3 w-3" /> {t('floorPlan.edit')}
              </button>
            </div>

            {mode === 'edit' && (
              <>
                <label className="flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted">
                  <Upload className="h-3 w-3" />
                  {t('floorPlan.uploadImage')}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && selectedPlanId) uploadImage.mutate({ planId: selectedPlanId, file });
                    }}
                  />
                </label>

                <button
                  onClick={() => {
                    if (selectedPlanId && confirm(t('floorPlan.confirmDelete'))) {
                      deletePlan.mutate(selectedPlanId);
                    }
                  }}
                  className="flex items-center gap-1 rounded border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" /> {t('common.delete')}
                </button>
              </>
            )}
          </div>
        )}

        {/* Canvas area */}
        {detail ? (
          <FloorPlanCanvas
            detail={detail}
            mode={mode}
            selectedPlacement={selectedPlacement}
            onSelectPlacement={setSelectedPlacement}
            onMovePlacement={(p, x, y) => {
              if (!selectedPlanId) return;
              upsertPlacement.mutate({ planId: selectedPlanId, exhibitId: p.exhibitId, x, y, rotation: p.rotation, scale: p.scale ?? 1 });
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Map className="mx-auto mb-2 h-12 w-12 opacity-30" />
              <p>{t('floorPlan.selectOrCreate')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar — selection details */}
      {selectedPlacement && detail && (
        <SelectionPanel
          placement={selectedPlacement}
          isEl={isEl}
          onClose={() => setSelectedPlacement(null)}
          onRotate={() => {
            if (!selectedPlanId) return;
            const newRot = (selectedPlacement.rotation + 90) % 360;
            upsertPlacement.mutate({
              planId: selectedPlanId,
              exhibitId: selectedPlacement.exhibitId,
              x: selectedPlacement.x,
              y: selectedPlacement.y,
              rotation: newRot,
              scale: selectedPlacement.scale ?? 1,
            });
          }}
          onScale={(newScale: number) => {
            if (!selectedPlanId) return;
            upsertPlacement.mutate({
              planId: selectedPlanId,
              exhibitId: selectedPlacement.exhibitId,
              x: selectedPlacement.x,
              y: selectedPlacement.y,
              rotation: selectedPlacement.rotation,
              scale: newScale,
            });
          }}
          onRemove={() => {
            if (!selectedPlanId) return;
            removePlacement.mutate({ planId: selectedPlanId, exhibitId: selectedPlacement.exhibitId });
          }}
        />
      )}
    </div>
  );
}

// ── Plan sidebar ─────────────────────────────────────────────

function PlanSidebar({
  plans, selectedPlanId, onSelect, showNewPlanInput, newPlanName,
  onNewPlanNameChange, onToggleNew, onCreatePlan, mode, isEl, planId, onPlaceExhibit,
}: {
  plans: FloorPlanSummary[];
  selectedPlanId: string | null;
  onSelect: (id: string) => void;
  showNewPlanInput: boolean;
  newPlanName: string;
  onNewPlanNameChange: (v: string) => void;
  onToggleNew: () => void;
  onCreatePlan: () => void;
  mode: 'view' | 'edit';
  isEl: boolean;
  planId: string | null;
  onPlaceExhibit: (exhibitId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex w-64 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{t('floorPlan.title')}</span>
        </div>
      </div>

      <div className="flex-shrink-0 overflow-y-auto border-b border-border">
        {plans.map((plan) => (
          <button
            key={plan.id}
            onClick={() => onSelect(plan.id)}
            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
              plan.id === selectedPlanId
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <span className="truncate">{plan.name}</span>
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
              {plan.placementCount}
            </span>
          </button>
        ))}

        {showNewPlanInput ? (
          <div className="flex gap-1 p-2">
            <input
              value={newPlanName}
              onChange={(e) => onNewPlanNameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCreatePlan()}
              placeholder={t('floorPlan.planName')}
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              autoFocus
            />
            <button onClick={onCreatePlan} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
              {t('common.add')}
            </button>
          </div>
        ) : (
          <button
            onClick={onToggleNew}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> {t('floorPlan.newPlan')}
          </button>
        )}
      </div>

      {/* Exhibit search for drag-to-place */}
      {mode === 'edit' && planId && (
        <ExhibitSearchPanel isEl={isEl} onPlace={onPlaceExhibit} />
      )}
    </div>
  );
}

// ── Exhibit search panel ─────────────────────────────────────

function ExhibitSearchPanel({ isEl, onPlace }: { isEl: boolean; onPlace: (id: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ExhibitSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleSearch(q: string) {
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.get<ExhibitSearchResult[]>(
          `/exhibits/search?q=${encodeURIComponent(q.trim())}&limit=20`,
        );
        setResults(data);
      } catch { setResults([]); }
    }, 250);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border p-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('floorPlan.addExhibits')}
        </p>
        <div className="flex items-center gap-1 rounded border border-border bg-background px-2">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full bg-transparent py-1.5 text-xs outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {results.map((ex) => (
          <button
            key={ex.id}
            onClick={() => onPlace(ex.id)}
            className="flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-xs hover:bg-muted"
          >
            <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{ex.exhibitName}</div>
              <div className="text-muted-foreground">
                {ex.displayId} · {isEl ? ex.categoryNameEl : ex.categoryNameEn}
              </div>
            </div>
            <Plus className="h-3 w-3 shrink-0 text-primary" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Canvas with pan/zoom ─────────────────────────────────────

function FloorPlanCanvas({
  detail, mode, selectedPlacement, onSelectPlacement, onMovePlacement,
}: {
  detail: FloorPlanDetail;
  mode: 'view' | 'edit';
  selectedPlacement: Placement | null;
  onSelectPlacement: (p: Placement | null) => void;
  onMovePlacement: (p: Placement, x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState<{ placementId: string; startMouseX: number; startMouseY: number; startX: number; startY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ placementId: string; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState<{ startMouseX: number; startMouseY: number; startTx: number; startTy: number } | null>(null);

  const hasImage = detail.svgStorageKey && detail.svgStorageKey !== '';

  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
    setImgSize(null);
  }, [detail.id]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({
      ...t,
      scale: Math.min(5, Math.max(0.2, t.scale * delta)),
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-pin]')) return;
    setPanning({ startMouseX: e.clientX, startMouseY: e.clientY, startTx: transform.x, startTy: transform.y });
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (panning) {
      setTransform((t) => ({
        ...t,
        x: panning.startTx + (e.clientX - panning.startMouseX),
        y: panning.startTy + (e.clientY - panning.startMouseY),
      }));
      return;
    }
    if (dragging && imgSize) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const imgDisplayW = imgSize.w * transform.scale;
      const imgDisplayH = imgSize.h * transform.scale;
      const imgLeft = rect.width / 2 + transform.x - imgDisplayW / 2;
      const imgTop = rect.height / 2 + transform.y - imgDisplayH / 2;
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left - imgLeft) / imgDisplayW));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top - imgTop) / imgDisplayH));
      setDragPos({ placementId: dragging.placementId, x: nx, y: ny });
    }
  }, [panning, dragging, imgSize, transform]);

  const handleMouseUp = useCallback(() => {
    if (dragPos) {
      const placement = detail.placements.find((p) => p.id === dragPos.placementId);
      if (placement) {
        onMovePlacement(placement, dragPos.x, dragPos.y);
      }
      setDragPos(null);
    }
    setPanning(null);
    setDragging(null);
  }, [dragPos, detail.placements, onMovePlacement]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 cursor-grab overflow-hidden bg-muted/30 active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom controls */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.min(5, t.scale * 1.2) }))}
          className="rounded border border-border bg-card p-1.5 hover:bg-muted"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.2, t.scale / 1.2) }))}
          className="rounded border border-border bg-card p-1.5 hover:bg-muted"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
          className="rounded border border-border bg-card p-1.5 hover:bg-muted"
          title={t('common.reset') as string}
        >
          <RotateCw className="h-4 w-4" />
        </button>
      </div>

      {/* Scale indicator */}
      <div className="absolute bottom-3 left-3 z-10 rounded bg-card/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
        {Math.round(transform.scale * 100)}%
      </div>

      {/* Canvas content */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale})`,
          transformOrigin: 'center center',
        }}
      >
        {hasImage ? (
          <div className="relative">
            <img
              src={detail.imageUrl}
              alt={detail.name}
              className="max-h-none max-w-none select-none"
              draggable={false}
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
            {imgSize && detail.placements.map((p) => (
              <Pin
                key={p.id}
                placement={dragPos && dragPos.placementId === p.id ? { ...p, x: dragPos.x, y: dragPos.y } : p}
                imgW={imgSize.w}
                imgH={imgSize.h}
                isSelected={selectedPlacement?.id === p.id}
                isEditMode={mode === 'edit'}
                onClick={() => onSelectPlacement(p)}
                onDragStart={(e) => {
                  if (mode !== 'edit') return;
                  e.stopPropagation();
                  setDragging({
                    placementId: p.id,
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startX: p.x,
                    startY: p.y,
                  });
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-96 w-[600px] items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50">
            <div className="text-center text-muted-foreground">
              <Upload className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">{t('floorPlan.noImage')}</p>
              <p className="text-xs">{t('floorPlan.uploadHint')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="absolute inset-x-0 bottom-3 text-center text-[10px] text-muted-foreground">
        {t('floorPlan.canvasHint')}
      </div>
    </div>
  );
}

// ── Pin component ────────────────────────────────────────────

function Pin({
  placement, imgW, imgH, isSelected, isEditMode, onClick, onDragStart,
}: {
  placement: Placement;
  imgW: number;
  imgH: number;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}) {
  const left = placement.x * imgW;
  const top = placement.y * imgH;
  const pinScale = placement.scale ?? 1;

  return (
    <div
      data-pin
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${isEditMode ? 'cursor-move' : 'cursor-pointer'}`}
      style={{ left, top }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={onDragStart}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-white shadow-md transition-transform ${
          isSelected
            ? 'border-white bg-primary ring-2 ring-primary/40'
            : 'border-white/80 bg-primary/80 hover:scale-110'
        }`}
        style={{ transform: `scale(${pinScale}) rotate(${placement.rotation}deg)` }}
      >
        <Archive className="h-3.5 w-3.5" />
      </div>
      <div className={`absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-foreground/90 px-1.5 py-0.5 text-[9px] font-mono text-background ${
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        {placement.exhibit.displayId}
      </div>
    </div>
  );
}

// ── Selection panel ──────────────────────────────────────────

function SelectionPanel({
  placement, isEl, onClose, onRotate, onScale, onRemove,
}: {
  placement: Placement;
  isEl: boolean;
  onClose: () => void;
  onRotate: () => void;
  onScale: (scale: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const ex = placement.exhibit;

  return (
    <div className="w-72 border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">{t('floorPlan.selection')}</span>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        {ex.primaryImageUrl && (
          <img
            src={ex.primaryImageUrl!}
            alt={ex.exhibitName}
            className="mb-3 h-32 w-full rounded-lg border border-border object-contain"
          />
        )}

        <p className="font-mono text-xs text-primary">{ex.displayId}</p>
        <p className="text-sm font-semibold">{ex.exhibitName}</p>
        <p className="text-xs text-muted-foreground">
          {ex.manufacturer}{ex.year ? ` · ${ex.year}` : ''}
        </p>
        <span className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs">
          {isEl ? ex.category.nameEl : ex.category.nameEn}
        </span>

        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('floorPlan.position')}
          </p>
          <div className="flex gap-2 text-xs">
            <div className="flex-1 rounded border border-border px-2 py-1.5">
              <span className="text-muted-foreground">x</span>{' '}
              <span className="font-mono">{(placement.x * 100).toFixed(1)}%</span>
            </div>
            <div className="flex-1 rounded border border-border px-2 py-1.5">
              <span className="text-muted-foreground">y</span>{' '}
              <span className="font-mono">{(placement.y * 100).toFixed(1)}%</span>
            </div>
          </div>

          <button
            onClick={onRotate}
            className="flex w-full items-center justify-center gap-1 rounded border border-border py-1.5 text-xs hover:bg-muted"
          >
            <RotateCw className="h-3 w-3" /> {t('floorPlan.rotate90')}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onScale(Math.max(0.3, (placement.scale ?? 1) - 0.1))}
              disabled={(placement.scale ?? 1) <= 0.3}
              className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-30"
            >
              <Minus className="h-3 w-3" />
            </button>
            <div className="flex-1 text-center text-xs font-mono">
              {Math.round((placement.scale ?? 1) * 100)}%
            </div>
            <button
              onClick={() => onScale(Math.min(3, (placement.scale ?? 1) + 0.1))}
              disabled={(placement.scale ?? 1) >= 3}
              className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-30"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <a
            href={`/exhibits/${ex.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1 rounded bg-primary py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
          >
            {t('floorPlan.openExhibit')}
          </a>

          <button
            onClick={onRemove}
            className="flex w-full items-center justify-center gap-1 rounded border border-destructive/30 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" /> {t('floorPlan.removeFromMap')}
          </button>
        </div>
      </div>
    </div>
  );
}
