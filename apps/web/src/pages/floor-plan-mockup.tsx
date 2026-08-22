/**
 * Low-fidelity mockup of the proposed Floor Plan editor.
 * No real backend wiring — visualises the proposed layout for review.
 */
import { useState } from 'react';
import {
  Map, Search, Plus, Settings, RotateCw, Upload, Trash2,
  ZoomIn, ZoomOut, Maximize2,
  Monitor, Book, Disc, Cpu, Newspaper, Gamepad2, X, ExternalLink,
} from 'lucide-react';

interface MockPlan { id: string; name: string; pinCount: number }
interface MockExhibit {
  id: string;
  displayId: string;
  name: string;
  manufacturer: string;
  category: 'computers' | 'books' | 'software' | 'processors' | 'magazines' | 'consoles';
  year: number;
  primaryImage?: string;
}
interface MockPin {
  id: string;
  exhibitId: string;
  x: number; // 0-1
  y: number; // 0-1
  rotation: number;
}

const PLANS: MockPlan[] = [
  { id: 'p1', name: 'Ground Floor — Main Gallery', pinCount: 47 },
  { id: 'p2', name: 'First Floor — Storage', pinCount: 312 },
  { id: 'p3', name: 'Basement — Workshop', pinCount: 23 },
];

const EXHIBITS: MockExhibit[] = [
  { id: 'e1', displayId: 'PC00006', name: 'Sharp PC8800', manufacturer: 'SHARP', category: 'computers', year: 1994 },
  { id: 'e2', displayId: 'BK00001', name: 'Sinclair ZX Spectrum +3 Manual', manufacturer: '—', category: 'books', year: 1987 },
  { id: 'e3', displayId: 'PC00016', name: 'Amstrad CPC 6128', manufacturer: 'AMSTRAD', category: 'computers', year: 1985 },
  { id: 'e4', displayId: 'CN00010', name: 'Atari 2600', manufacturer: 'ATARI', category: 'consoles', year: 1980 },
  { id: 'e5', displayId: 'MA00010', name: 'Byte Magazine — March 1981', manufacturer: '—', category: 'magazines', year: 1981 },
  { id: 'e6', displayId: 'PR00004', name: 'Intel Pentium III 800MHz', manufacturer: 'INTEL', category: 'processors', year: 1999 },
  { id: 'e7', displayId: 'SW00100', name: 'Lotus 1-2-3 (5.25")', manufacturer: 'LOTUS', category: 'software', year: 1988 },
  { id: 'e8', displayId: 'PC00172', name: 'Amstrad ALT 386SX', manufacturer: 'AMSTRAD', category: 'computers', year: 1988 },
  { id: 'e9', displayId: 'CN00021', name: 'Commodore 64', manufacturer: 'COMMODORE', category: 'consoles', year: 1982 },
  { id: 'e10', displayId: 'PC00001', name: '486SLC2', manufacturer: 'UNKNOWN', category: 'computers', year: 1996 },
];

const PINS: MockPin[] = [
  { id: 'pin1', exhibitId: 'e1', x: 0.30, y: 0.30, rotation: 0 },
  { id: 'pin2', exhibitId: 'e3', x: 0.36, y: 0.28, rotation: 0 },
  { id: 'pin3', exhibitId: 'e8', x: 0.42, y: 0.32, rotation: 90 },
  { id: 'pin4', exhibitId: 'e10', x: 0.48, y: 0.30, rotation: 0 },
  { id: 'pin5', exhibitId: 'e4', x: 0.66, y: 0.38, rotation: 0 },
  { id: 'pin6', exhibitId: 'e9', x: 0.72, y: 0.36, rotation: 0 },
  { id: 'pin7', exhibitId: 'e2', x: 0.18, y: 0.62, rotation: 0 },
  { id: 'pin8', exhibitId: 'e5', x: 0.24, y: 0.66, rotation: 0 },
  { id: 'pin9', exhibitId: 'e7', x: 0.30, y: 0.64, rotation: 0 },
  { id: 'pin10', exhibitId: 'e6', x: 0.78, y: 0.66, rotation: 0 },
];

const CATEGORY_VISUAL: Record<string, { icon: any; color: string; bg: string }> = {
  computers:  { icon: Monitor,   color: '#2563eb', bg: '#dbeafe' },
  books:      { icon: Book,      color: '#d97706', bg: '#fef3c7' },
  software:   { icon: Disc,      color: '#7c3aed', bg: '#ede9fe' },
  processors: { icon: Cpu,       color: '#dc2626', bg: '#fee2e2' },
  magazines:  { icon: Newspaper, color: '#e11d48', bg: '#ffe4e6' },
  consoles:   { icon: Gamepad2,  color: '#9333ea', bg: '#f3e8ff' },
};

const CATEGORY_LABEL: Record<string, string> = {
  computers: 'Computers',
  books: 'Books',
  software: 'Software',
  processors: 'Processors',
  magazines: 'Magazines',
  consoles: 'Consoles',
};

// Inline SVG of a fictional museum gallery layout, used as the floor plan background.
function FloorPlanSvg() {
  return (
    <svg viewBox="0 0 1000 600" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {/* Outer wall */}
      <rect x="20" y="20" width="960" height="560" fill="#fafaf9" stroke="#1c1917" strokeWidth="3" rx="2" />

      {/* Inner walls — gallery rooms */}
      {/* Room 1: top-left vintage micros */}
      <rect x="40" y="40" width="280" height="220" fill="#f5f5f4" stroke="#78716c" strokeWidth="1.5" />
      <text x="55" y="62" className="text-[11px] fill-stone-500" fontFamily="monospace">VINTAGE MICROS</text>

      {/* Room 2: top-middle home computers */}
      <rect x="340" y="40" width="280" height="220" fill="#f5f5f4" stroke="#78716c" strokeWidth="1.5" />
      <text x="355" y="62" className="text-[11px] fill-stone-500" fontFamily="monospace">HOME COMPUTERS</text>
      {/* Display tables */}
      <rect x="370" y="120" width="220" height="40" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="1" />
      <rect x="370" y="180" width="220" height="40" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="1" />

      {/* Room 3: top-right consoles */}
      <rect x="640" y="40" width="320" height="220" fill="#f5f5f4" stroke="#78716c" strokeWidth="1.5" />
      <text x="655" y="62" className="text-[11px] fill-stone-500" fontFamily="monospace">CONSOLES &amp; ARCADE</text>
      <rect x="680" y="180" width="240" height="50" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="1" />

      {/* Corridor */}
      <rect x="40" y="280" width="920" height="40" fill="#fef3c7" opacity="0.4" />
      <text x="475" y="305" className="text-[11px] fill-stone-500" fontFamily="monospace">CORRIDOR</text>

      {/* Room 4: bottom-left books */}
      <rect x="40" y="340" width="380" height="240" fill="#f5f5f4" stroke="#78716c" strokeWidth="1.5" />
      <text x="55" y="362" className="text-[11px] fill-stone-500" fontFamily="monospace">LIBRARY &amp; SOFTWARE</text>
      <rect x="60" y="430" width="340" height="30" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="1" />
      <rect x="60" y="480" width="340" height="30" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="1" />

      {/* Room 5: bottom-middle workshop */}
      <rect x="440" y="340" width="240" height="240" fill="#f5f5f4" stroke="#78716c" strokeWidth="1.5" />
      <text x="455" y="362" className="text-[11px] fill-stone-500" fontFamily="monospace">RESTORATION</text>

      {/* Room 6: bottom-right components */}
      <rect x="700" y="340" width="260" height="240" fill="#f5f5f4" stroke="#78716c" strokeWidth="1.5" />
      <text x="715" y="362" className="text-[11px] fill-stone-500" fontFamily="monospace">COMPONENTS</text>
      <rect x="720" y="420" width="220" height="30" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="1" />

      {/* Doorways */}
      <line x1="180" y1="280" x2="220" y2="280" stroke="#fafaf9" strokeWidth="4" />
      <line x1="480" y1="280" x2="520" y2="280" stroke="#fafaf9" strokeWidth="4" />
      <line x1="780" y1="280" x2="820" y2="280" stroke="#fafaf9" strokeWidth="4" />
      <line x1="180" y1="320" x2="220" y2="320" stroke="#fafaf9" strokeWidth="4" />
      <line x1="540" y1="320" x2="580" y2="320" stroke="#fafaf9" strokeWidth="4" />
      <line x1="780" y1="320" x2="820" y2="320" stroke="#fafaf9" strokeWidth="4" />

      {/* Entrance */}
      <line x1="480" y1="20" x2="540" y2="20" stroke="#fafaf9" strokeWidth="6" />
      <text x="495" y="14" className="text-[10px] fill-stone-600" fontFamily="monospace">ENTRANCE</text>

      {/* Compass */}
      <circle cx="940" cy="50" r="18" fill="#fff" stroke="#a8a29e" strokeWidth="1" />
      <text x="935" y="45" className="text-[8px] fill-stone-700" fontFamily="monospace">N</text>
      <line x1="940" y1="38" x2="940" y2="62" stroke="#dc2626" strokeWidth="1.5" />
    </svg>
  );
}

export function FloorPlanMockupPage() {
  const [activePlan, setActivePlan] = useState(PLANS[0]!);
  const [search, setSearch] = useState('');
  const [selectedPinId, setSelectedPinId] = useState<string | null>('pin1');
  const [editMode, setEditMode] = useState(true);

  const exhibitsById = Object.fromEntries(EXHIBITS.map((e) => [e.id, e]));
  const filteredExhibits = EXHIBITS.filter((e) =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.displayId.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedPin = selectedPinId ? PINS.find((p) => p.id === selectedPinId) : null;
  const selectedExhibit = selectedPin ? exhibitsById[selectedPin.exhibitId] : null;

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left sidebar */}
      <aside className="flex w-72 flex-col border-r border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Map className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold">Floor plans</h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Mockup — not connected to data</p>
        </div>

        {/* Plan list */}
        <div className="border-b border-border p-2">
          {PLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePlan(p)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                activePlan.id === p.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
              }`}
            >
              <span className="truncate">{p.name}</span>
              <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">{p.pinCount}</span>
            </button>
          ))}
          <button className="mt-1 flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted">
            <Plus className="h-3.5 w-3.5" /> New floor plan
          </button>
        </div>

        {/* Exhibit search */}
        <div className="border-b border-border px-3 py-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Drag onto map
          </p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exhibits…"
              className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-sm outline-none ring-ring focus:ring-2"
            />
          </div>
        </div>

        {/* Exhibit list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filteredExhibits.map((ex) => {
            const visual = CATEGORY_VISUAL[ex.category]!;
            const placed = PINS.some((p) => p.exhibitId === ex.id);
            const Icon = visual.icon;
            return (
              <div
                key={ex.id}
                draggable
                className={`mb-1 flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 transition-colors active:cursor-grabbing ${
                  placed ? 'border-border bg-muted/30 opacity-50' : 'border-border bg-background hover:border-primary/50 hover:shadow-sm'
                }`}
                title={placed ? 'Already on this plan' : 'Drag onto the map'}
              >
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{ backgroundColor: visual.bg }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: visual.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{ex.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{ex.displayId}</p>
                </div>
                {placed && <span className="text-[10px] text-muted-foreground">●</span>}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main canvas */}
      <main className="relative flex-1 overflow-hidden bg-muted/40">
        {/* Top toolbar */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-border bg-card/90 px-4 py-2.5 backdrop-blur">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-sm font-semibold">{activePlan.name}</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{PINS.length} placements</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-input">
              <button
                onClick={() => setEditMode(false)}
                className={`px-3 py-1 text-xs ${!editMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                View
              </button>
              <button
                onClick={() => setEditMode(true)}
                className={`px-3 py-1 text-xs ${editMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                Edit
              </button>
            </div>

            <div className="h-5 w-px bg-border" />

            <button className="rounded p-1.5 hover:bg-muted" title="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button className="rounded p-1.5 hover:bg-muted" title="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button className="rounded p-1.5 hover:bg-muted" title="Fit to screen">
              <Maximize2 className="h-4 w-4" />
            </button>

            <div className="h-5 w-px bg-border" />

            <button className="flex items-center gap-1 rounded border border-input px-2.5 py-1 text-xs hover:bg-muted">
              <Upload className="h-3 w-3" />
              Replace image
            </button>
            <button className="flex items-center gap-1 rounded border border-input px-2.5 py-1 text-xs hover:bg-muted">
              <Settings className="h-3 w-3" />
              Calibrate
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="absolute inset-0 mt-12 overflow-auto">
          <div className="relative mx-auto my-6 aspect-[10/6] w-full max-w-5xl rounded-lg border border-border bg-card shadow-lg">
            <FloorPlanSvg />

            {/* Pins */}
            {PINS.map((pin) => {
              const exhibit = exhibitsById[pin.exhibitId];
              if (!exhibit) return null;
              const visual = CATEGORY_VISUAL[exhibit.category]!;
              const Icon = visual.icon;
              const isSelected = pin.id === selectedPinId;
              return (
                <button
                  key={pin.id}
                  onClick={() => setSelectedPinId(pin.id)}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 transition-transform ${
                    isSelected ? 'z-20 scale-110' : 'z-10 hover:scale-110'
                  }`}
                  style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                  title={`${exhibit.displayId} · ${exhibit.name}`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-md transition-all ${
                      isSelected ? 'border-primary ring-4 ring-primary/30' : 'border-white'
                    }`}
                    style={{
                      backgroundColor: visual.bg,
                      transform: pin.rotation ? `rotate(${pin.rotation}deg)` : undefined,
                    }}
                  >
                    <Icon className="h-4 w-4" style={{ color: visual.color }} />
                  </div>
                  {isSelected && (
                    <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background shadow">
                      {exhibit.displayId}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Drop hint */}
            {editMode && (
              <div className="pointer-events-none absolute right-4 bottom-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary">
                Drop an exhibit chip here to place it
              </div>
            )}
          </div>

          <p className="mb-6 text-center text-[11px] text-muted-foreground">
            Pan: drag empty area · Zoom: Ctrl/Cmd + scroll · Click pin: open details
          </p>
        </div>
      </main>

      {/* Right panel — selected exhibit */}
      {selectedExhibit && (
        <aside className="flex w-80 flex-col border-l border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-display text-sm font-semibold">Selection</h3>
            <button
              onClick={() => setSelectedPinId(null)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                {(() => {
                  const visual = CATEGORY_VISUAL[selectedExhibit.category]!;
                  const Icon = visual.icon;
                  return <Icon className="h-16 w-16" />;
                })()}
              </div>
            </div>

            <div>
              <p className="font-mono text-xs font-semibold text-primary">{selectedExhibit.displayId}</p>
              <h4 className="mt-1 font-display text-base font-semibold leading-tight">{selectedExhibit.name}</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">{selectedExhibit.manufacturer} · {selectedExhibit.year}</p>
              <span
                className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: CATEGORY_VISUAL[selectedExhibit.category]!.bg,
                  color: CATEGORY_VISUAL[selectedExhibit.category]!.color,
                }}
              >
                {CATEGORY_LABEL[selectedExhibit.category]}
              </span>
            </div>

            {editMode && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Position
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-input bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">x</span>{' '}
                    <span className="font-mono">{(selectedPin!.x * 100).toFixed(1)}%</span>
                  </div>
                  <div className="rounded border border-input bg-muted/30 px-2 py-1.5">
                    <span className="text-muted-foreground">y</span>{' '}
                    <span className="font-mono">{(selectedPin!.y * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <button className="flex w-full items-center justify-center gap-1.5 rounded border border-input px-3 py-1.5 text-xs hover:bg-muted">
                  <RotateCw className="h-3 w-3" /> Rotate 90°
                </button>
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <button className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                <ExternalLink className="h-3 w-3" />
                Open exhibit
              </button>
              {editMode && (
                <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3 w-3" />
                  Remove from map
                </button>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
