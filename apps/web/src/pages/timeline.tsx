import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ZoomIn, ZoomOut, Maximize2, ChevronRight, ChevronLeft, Monitor, ArrowRight,
  Settings2, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

interface TLExhibit { id: string; displayId: string; exhibitName: string; score: number; thumbnailUrl: string | null }
interface TLModel {
  id: string; name: string; year: number | null; imageUrl: string | null;
  wikidataQid: string | null; source: string; hidden: boolean;
  owned: boolean; exhibits: TLExhibit[];
}
interface TLCompany { id: string; name: string; wikidataQids: string[]; displayOrder: number; models: TLModel[] }
interface WdEntity {
  description: { en: string | null; el: string | null };
  wikipedia: { en: string | null; el: string | null };
  image: string | null;
}

// --- Design tokens (from the Claude Design handoff) ------------------------
const ACCENT = '#2B4ACB';
const INK = '#1B1A17';
const BODY = '#6B6A62';
const SEC = '#3C3A34';
const MUTED = '#9A978D';
const FAINT = '#A5A299';
const BG = '#F4F2EB';
const PANEL = '#FCFBF7';
const HAIR = 'rgba(27,26,23,0.1)';
const FD = "'Space Grotesk', sans-serif"; // display / names
const FM = "'JetBrains Mono', monospace"; // data / labels
const RAIL = 252;
const OV_PXY = 26;       // px per year (overview, ×zoom)
const ROW_H = 60;
const D_CARD_W = 184;
const D_GAP = 18;
const D_LANE_H = 250; // fits a card with a 2-line name + vertical breathing room

const halo = (pct: number) => `0 0 0 ${pct}px color-mix(in srgb, ${ACCENT} 15%, transparent)`;

export function TimelinePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('timeline:write');

  const { data } = useQuery({ queryKey: ['timeline'], queryFn: () => api.get<{ companies: TLCompany[] }>('/timeline') });
  const companies = useMemo(
    () => (data?.companies ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder),
    [data],
  );

  const [view, setView] = useState<'overview' | 'company'>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [detailZoom, setDetailZoom] = useState(1);
  const [hover, setHover] = useState<{ companyId: string; modelId: string } | null>(null);
  const [hoverCompany, setHoverCompany] = useState<string | null>(null);
  const [picker, setPicker] = useState<TLModel | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [enrichMap, setEnrichMap] = useState<Record<string, WdEntity | 'loading' | 'error'>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; active: boolean }>({ x: 0, y: 0, left: 0, top: 0, active: false });
  const autoScrolled = useRef(false);

  // Overview year domain (cover data, but at least the design's 1953–2017).
  const { minYear, maxYear } = useMemo(() => {
    const ys: number[] = [];
    for (const c of companies) for (const m of c.models) if (m.year) ys.push(m.year);
    return { minYear: Math.min(1953, ...ys), maxYear: Math.max(2017, ...ys) };
  }, [companies]);
  const range = Math.max(1, maxYear - minYear);
  const laneWidth = range * OV_PXY * zoom;
  const pct = (year: number) => ((year - minYear) / range) * 100;

  // Lazily enrich a hovered/clicked model (Wikipedia links for the action).
  const enrich = useCallback((qid: string | null) => {
    if (!qid || qid in enrichMap) return;
    setEnrichMap((m) => ({ ...m, [qid]: 'loading' }));
    api.get<WdEntity>(`/integrations/wikidata/entity/${qid}`)
      .then((e) => setEnrichMap((m) => ({ ...m, [qid]: e })))
      .catch(() => setEnrichMap((m) => ({ ...m, [qid]: 'error' })));
  }, [enrichMap]);

  function wikiUrl(m: TLModel, companyName?: string): string {
    const e = m.wikidataQid ? enrichMap[m.wikidataQid] : undefined;
    if (e && e !== 'loading' && e !== 'error') return e.wikipedia.en || e.wikipedia.el || `https://www.wikidata.org/wiki/${m.wikidataQid}`;
    if (m.wikidataQid) return `https://www.wikidata.org/wiki/${m.wikidataQid}`;
    // QID-less (e.g. EPOCALC) models: jump to the matching Wikipedia article,
    // or its search results if there's no exact title. Prefix the brand when the
    // model name doesn't already carry it, so "C64" → "Commodore C64".
    const hasBrand = companyName && m.name.toLowerCase().includes(companyName.toLowerCase());
    const q = hasBrand || !companyName ? m.name : `${companyName} ${m.name}`;
    return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`;
  }

  // Action: owned w/ many exhibits → picker; owned w/ one → that exhibit;
  // not-held (or owned with none) → Wikipedia (new tab).
  function activate(m: TLModel, companyName?: string) {
    if (m.owned && m.exhibits.length > 1) { setPicker(m); return; }
    if (m.owned && m.exhibits[0]) { navigate(`/exhibits/${m.exhibits[0].id}`); return; }
    const u = wikiUrl(m, companyName);
    if (u !== '#') window.open(u, '_blank', 'noopener');
  }

  // --- Wheel: ⌘/Ctrl-scroll zooms; plain scroll pans natively (up/down + left/right). ---
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // let the browser scroll the canvas in both axes
      e.preventDefault();
      if (view === 'overview') {
        setZoom((z) => Math.min(3.2, Math.max(0.7, z * (e.deltaY < 0 ? 1.11 : 0.9))));
      } else {
        setDetailZoom((z) => Math.min(2.2, Math.max(0.2, z * (e.deltaY < 0 ? 1.09 : 0.92))));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view]);

  // --- Drag to pan (both axes: scrollLeft + scrollTop) ---
  function onMouseDown(e: React.MouseEvent) {
    const tgt = e.target as HTMLElement;
    if (tgt.closest('[data-dot],[data-card]')) return;
    const el = scrollRef.current; if (!el) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, active: true };
    setGrabbing(true);
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current.active) return;
    const el = scrollRef.current; if (!el) return;
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
    el.scrollTop = drag.current.top - (e.clientY - drag.current.y);
  }
  function endDrag() { drag.current.active = false; setGrabbing(false); }

  // Auto-scroll the dense post-1974 region into view on first overview render.
  useEffect(() => {
    if (view !== 'overview' || autoScrolled.current || !companies.length) return;
    const el = scrollRef.current; if (!el || laneWidth < 10) return;
    el.scrollLeft = (pct(1974) / 100) * laneWidth;
    autoScrolled.current = true;
  }, [view, companies.length, laneWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = companies.find((c) => c.id === selectedId) ?? null;
  function openCompany(id: string) { setSelectedId(id); setView('company'); setDetailZoom(1); setHover(null); }
  function back() { setView('overview'); setHover(null); }

  const totalOwned = companies.reduce((n, c) => n + c.models.filter((m) => m.owned).length, 0);
  const totalModels = companies.reduce((n, c) => n + c.models.length, 0);

  // 5-year ticks for the overview axis.
  const ovTicks: number[] = [];
  for (let y = Math.ceil(minYear / 5) * 5; y <= maxYear; y += 5) ovTicks.push(y);
  const tickColor = (y: number) => (y < 1970 ? '#A89A86' : y >= 1995 ? '#8E9BB0' : '#9A978D');

  // Decade bands.
  const bands: Array<{ left: number; width: number; tint: boolean }> = [];
  for (let d = Math.floor(minYear / 10) * 10, i = 0; d < maxYear; d += 10, i++) {
    bands.push({ left: (Math.max(d, minYear) - minYear) / range * 100, width: (10 / range) * 100, tint: i % 2 === 1 });
  }

  return (
    <div className="-m-4 sm:-m-6" style={{ background: BG, color: INK, minHeight: 'calc(100% + 3rem)', fontFamily: "'Hanken Grotesk', system-ui, sans-serif" }}>
      <style>{`@keyframes tlTip{from{opacity:0;transform:translateX(-50%) translateY(4px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      <div style={{ maxWidth: 1340, margin: '0 auto', padding: '22px 24px 60px' }}>

        {view === 'overview' ? (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 18 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h1 style={{ margin: 0, fontFamily: FD, fontWeight: 700, fontSize: 42, letterSpacing: '-0.02em', lineHeight: 1 }}>{t('timeline.title')}</h1>
                  <span style={{ fontFamily: FM, fontSize: 12, color: '#88857C', border: `1px solid rgba(27,26,23,0.14)`, borderRadius: 99, padding: '3px 10px' }}>{totalOwned}/{totalModels}</span>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 14.5, color: BODY, maxWidth: 560 }}>{t('timeline.subtitle')}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                <OwnedToggle checked={ownedOnly} onChange={setOwnedOnly} label={t('timeline.ownedOnly')} />
                <ZoomGroup onOut={() => setZoom((z) => Math.max(0.7, z / 1.25))} onIn={() => setZoom((z) => Math.min(3.2, z * 1.25))} onFit={() => { setZoom(1); }} fitTitle={t('timeline.fit')} />
                {canManage && (
                  <button onClick={() => navigate('/timeline/manage')} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 15px', background: INK, color: BG, border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
                    <Settings2 size={15} /> {t('timeline.manage')}
                  </button>
                )}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 12.5, color: BODY }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: 99, background: ACCENT, boxShadow: halo(4) }} /> {t('timeline.legendOwned')}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: 99, background: PANEL, border: '1.5px solid rgba(27,26,23,0.3)' }} /> {t('timeline.legendMissing')}</span>
              </div>
              <div style={{ fontFamily: FM, fontSize: 11.5, color: MUTED }}>{t('timeline.hint')}</div>
            </div>

            {/* Panel */}
            <div style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,23,0.04), 0 18px 40px -28px rgba(27,26,23,0.25)', overflow: 'hidden' }}>
              <div
                ref={scrollRef}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}
                style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 250px)', cursor: grabbing ? 'grabbing' : 'grab', overscrollBehavior: 'contain' }}
              >
                <div style={{ position: 'relative', minWidth: '100%', width: RAIL + laneWidth }}>
                  {/* decade bands */}
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: RAIL, right: 0, pointerEvents: 'none' }}>
                    {bands.map((b, i) => (
                      <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${b.left}%`, width: `${b.width}%`, background: b.tint ? 'rgba(27,26,23,0.022)' : 'transparent' }} />
                    ))}
                  </div>

                  {/* axis */}
                  <div style={{ position: 'relative', display: 'flex', height: 42, borderBottom: '1px solid rgba(27,26,23,0.08)' }}>
                    <div style={{ position: 'sticky', left: 0, zIndex: 6, width: RAIL, flex: 'none', background: PANEL, borderRight: '1px solid rgba(27,26,23,0.08)' }} />
                    <div style={{ position: 'relative', flex: 1 }}>
                      {ovTicks.map((y) => (
                        <div key={y} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(y)}%`, display: 'flex', alignItems: 'center' }}>
                          <span style={{ fontFamily: FM, fontSize: 11.5, transform: 'translateX(-50%)', color: tickColor(y) }}>{y}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* rows */}
                  {companies.map((c) => {
                    const ownedCount = c.models.filter((m) => m.owned).length;
                    const undated = c.models.filter((m) => !m.year && (!ownedOnly || m.owned)).length;
                    const dated = c.models.filter((m) => m.year && (!ownedOnly || m.owned)).sort((a, b) => (a.year as number) - (b.year as number));
                    // collision offset for dots sharing a year
                    const byYear = new Map<number, TLModel[]>();
                    for (const m of dated) { const arr = byYear.get(m.year as number) ?? []; arr.push(m); byYear.set(m.year as number, arr); }
                    // Dots sharing a year keep their true x (year) and fan out
                    // vertically within the row instead of shifting along time.
                    const placed = dated.map((m) => {
                      const grp = byYear.get(m.year as number)!; const i = grp.indexOf(m); const n = grp.length;
                      const spacing = n > 1 ? Math.min(15, (ROW_H - 22) / (n - 1)) : 0;
                      const dy = (i - (n - 1) / 2) * spacing;
                      return { m, leftPct: pct(m.year as number), dy };
                    });
                    const hoverModel = hover?.companyId === c.id ? placed.find((p) => p.m.id === hover.modelId) : undefined;
                    const rowHovered = hoverCompany === c.id;
                    return (
                      <div
                        key={c.id}
                        onMouseEnter={() => setHoverCompany(c.id)}
                        onMouseLeave={() => setHoverCompany((h) => (h === c.id ? null : h))}
                        style={{ position: 'relative', display: 'flex', borderBottom: '1px solid rgba(27,26,23,0.05)', background: rowHovered ? `color-mix(in srgb, ${ACCENT} 5%, transparent)` : 'transparent', transition: 'background .15s ease' }}
                      >
                        {/* rail */}
                        <button
                          onClick={() => openCompany(c.id)}
                          style={{ position: 'sticky', left: 0, zIndex: 5, width: RAIL, flex: 'none', background: rowHovered ? `color-mix(in srgb, ${ACCENT} 7%, ${PANEL})` : PANEL, borderRight: '1px solid rgba(27,26,23,0.08)', padding: '13px 16px 13px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', border: 'none', borderBottom: 'none', transition: 'background .15s ease' }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontFamily: FD, fontWeight: 600, fontSize: 17, lineHeight: 1.1, letterSpacing: '-0.01em', color: INK }}>{c.name}</span>
                            <span style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ flex: 1, maxWidth: 78, height: 4, borderRadius: 99, background: 'rgba(27,26,23,0.1)', overflow: 'hidden' }}>
                                <span style={{ display: 'block', height: '100%', width: `${c.models.length ? (ownedCount / c.models.length) * 100 : 0}%`, background: ACCENT, borderRadius: 99 }} />
                              </span>
                              <span style={{ fontFamily: FM, fontSize: 11, color: BODY }}>{ownedCount}/{c.models.length}</span>
                            </span>
                            {undated > 0 && <span style={{ display: 'block', marginTop: 3, fontFamily: FM, fontSize: 10.5, color: FAINT }}>{t('timeline.undated', { count: undated })}</span>}
                          </span>
                          <ChevronRight size={15} color={rowHovered ? ACCENT : '#B6B3A8'} style={{ flex: 'none', transition: 'transform .15s ease, color .15s ease', transform: rowHovered ? 'translateX(2px)' : 'none' }} />
                        </button>

                        {/* lane */}
                        <div style={{ position: 'relative', flex: 1, height: ROW_H }}>
                          {placed.map(({ m, leftPct, dy }) => (
                            <div
                              key={m.id}
                              data-dot="1"
                              onMouseEnter={() => { setHover({ companyId: c.id, modelId: m.id }); enrich(m.wikidataQid); }}
                              onMouseLeave={() => setHover((h) => (h?.modelId === m.id ? null : h))}
                              onClick={() => activate(m, c.name)}
                              style={{ position: 'absolute', top: `calc(50% + ${dy}px)`, left: `${leftPct}%`, width: 26, height: 26, transform: 'translate(-50%,-50%)', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 2 }}
                            >
                              {m.owned
                                ? <span style={{ width: 13, height: 13, borderRadius: 99, background: ACCENT, boxShadow: halo(4) }} />
                                : <span style={{ width: 11, height: 11, borderRadius: 99, background: PANEL, border: '1.5px solid rgba(27,26,23,0.3)' }} />}
                            </div>
                          ))}

                          {/* rollover */}
                          {hoverModel && (
                            <div style={{ position: 'absolute', top: `calc(50% + ${hoverModel.dy + 18}px)`, left: `${hoverModel.leftPct}%`, transform: 'translateX(-50%)', zIndex: 30, width: 236, animation: 'tlTip .14s ease', pointerEvents: 'none' }}>
                              <div style={{ background: '#fff', border: '1px solid rgba(27,26,23,0.12)', borderRadius: 11, boxShadow: '0 14px 36px -10px rgba(27,26,23,0.32)', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', gap: 12, padding: 12 }}>
                                  <div style={{ width: 54, height: 54, flex: 'none', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(27,26,23,0.08)', display: 'grid', placeItems: 'center', color: '#B6B3A8', background: hoverModel.m.owned ? 'linear-gradient(135deg,#EDEBFF,#E3E0FB)' : 'rgba(27,26,23,0.035)' }}>
                                    {hoverModel.m.imageUrl ? <img src={hoverModel.m.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Monitor size={22} />}
                                  </div>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontFamily: FD, fontWeight: 600, fontSize: 15.5, lineHeight: 1.15, color: INK }}>{hoverModel.m.name}</div>
                                    <div style={{ marginTop: 3, fontFamily: FM, fontSize: 11.5, color: MUTED }}>{hoverModel.m.year} · {hoverModel.m.owned ? t('timeline.inCollection') : t('timeline.knownModel')}</div>
                                  </div>
                                </div>
                                <div style={{ padding: '9px 12px', borderTop: '1px solid rgba(27,26,23,0.07)', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, background: hoverModel.m.owned && hoverModel.m.exhibits.length ? `color-mix(in srgb, ${ACCENT} 7%, #fff)` : '#fff' }}>
                                  <ArrowRight size={14} color={hoverModel.m.owned ? ACCENT : MUTED} />
                                  <span style={{ fontWeight: 600, color: hoverModel.m.owned ? ACCENT : BODY }}>
                                    {hoverModel.m.owned
                                      ? (hoverModel.m.exhibits.length ? t('timeline.linkedExhibits', { count: hoverModel.m.exhibits.length }) : t('timeline.openInCollection'))
                                      : t('timeline.wikipediaEntry')}
                                  </span>
                                </div>
                              </div>
                              <div style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 11, height: 11, background: '#fff', borderLeft: '1px solid rgba(27,26,23,0.12)', borderTop: '1px solid rgba(27,26,23,0.12)' }} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ height: 64 }} />
                </div>
              </div>
            </div>
          </>
        ) : selected ? (
          <CompanyDetail
            company={selected}
            ownedOnly={ownedOnly}
            setOwnedOnly={setOwnedOnly}
            detailZoom={detailZoom}
            setDetailZoom={setDetailZoom}
            scrollRef={scrollRef}
            grabbing={grabbing}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} endDrag={endDrag}
            onBack={back}
            onActivate={activate}
            t={t}
          />
        ) : null}
      </div>


      {picker && (
        <div onClick={() => setPicker(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(27,26,23,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 340, maxWidth: '100%', background: '#fff', borderRadius: 12, border: '1px solid rgba(27,26,23,0.12)', boxShadow: '0 24px 60px -20px rgba(27,26,23,0.45)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '13px 14px', borderBottom: '1px solid rgba(27,26,23,0.08)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FD, fontWeight: 600, fontSize: 15.5, color: INK }}>{picker.name}</div>
                <div style={{ fontFamily: FM, fontSize: 11.5, color: MUTED, marginTop: 2 }}>{t('timeline.linkedExhibits', { count: picker.exhibits.length })}</div>
              </div>
              <button onClick={() => setPicker(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED, padding: 2 }}><X size={18} /></button>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: 6 }}>
              {picker.exhibits.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => { setPicker(null); navigate(`/exhibits/${ex.id}`); }}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(27,26,23,0.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: FM, fontSize: 11.5, color: ACCENT }}>{ex.displayId}</span>
                    <span style={{ display: 'block', fontSize: 13, color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.exhibitName}</span>
                  </span>
                  <ArrowRight size={15} color={MUTED} style={{ flex: 'none' }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Maker detail (cards on a year timeline) -------------------------------
function CompanyDetail({
  company, ownedOnly, setOwnedOnly, detailZoom, setDetailZoom, scrollRef, grabbing,
  onMouseDown, onMouseMove, endDrag, onBack, onActivate, t,
}: {
  company: TLCompany;
  ownedOnly: boolean; setOwnedOnly: (v: boolean) => void;
  detailZoom: number; setDetailZoom: (f: (z: number) => number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  grabbing: boolean;
  onMouseDown: (e: React.MouseEvent) => void; onMouseMove: (e: React.MouseEvent) => void; endDrag: () => void;
  onBack: () => void;
  onActivate: (m: TLModel, companyName?: string) => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  // Everything scales with detailZoom — cards (photo + text via transform),
  // gaps, lane height and the year spacing — so zooming out genuinely fits more.
  const z = detailZoom;
  const pxy = 132 * z;
  const cardW = D_CARD_W * z;
  const gap = D_GAP * z;
  const laneH = D_LANE_H * z;
  const models = company.models.filter((m) => m.year && (!ownedOnly || m.owned)).sort((a, b) => (a.year as number) - (b.year as number));
  const ownedCount = company.models.filter((m) => m.owned).length;
  const undated = company.models.filter((m) => !m.year && (!ownedOnly || m.owned)).length;

  const minY = models.length ? (models[0]!.year as number) : 1980;
  const maxY = models.length ? (models[models.length - 1]!.year as number) : 1990;

  // lane packing (in scaled px)
  const laneEnd: number[] = [];
  const cards = models.map((m) => {
    const x = ((m.year as number) - minY) * pxy;
    let lane = laneEnd.findIndex((end) => end <= x);
    if (lane === -1) lane = laneEnd.length;
    laneEnd[lane] = x + cardW + gap;
    return { m, left: x, top: lane * laneH };
  });
  const laneCount = Math.max(1, laneEnd.length);
  const contentW = (maxY - minY) * pxy + cardW + 40;
  const ticks: number[] = [];
  for (let y = minY; y <= maxY; y++) ticks.push(y);

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 15px', background: '#fff', border: '1px solid rgba(27,26,23,0.14)', borderRadius: 9, cursor: 'pointer', fontWeight: 500, fontSize: 13.5, color: SEC }}>
            <ChevronLeft size={15} /> {t('timeline.back')}
          </button>
          <div>
            <h1 style={{ margin: 0, fontFamily: FD, fontWeight: 700, fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em' }}>{company.name}</h1>
            <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 120, height: 5, borderRadius: 99, background: 'rgba(27,26,23,0.1)', overflow: 'hidden', display: 'inline-block' }}>
                <span style={{ display: 'block', height: '100%', width: `${company.models.length ? (ownedCount / company.models.length) * 100 : 0}%`, background: ACCENT }} />
              </span>
              <span style={{ fontFamily: FM, fontSize: 12.5, color: BODY }}>
                {ownedCount}/{company.models.length} {t('timeline.inCollection').toLowerCase()}{undated > 0 ? ` · ${t('timeline.undated', { count: undated })}` : ''}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <OwnedToggle checked={ownedOnly} onChange={setOwnedOnly} label={t('timeline.ownedOnly')} />
          <ZoomGroup onOut={() => setDetailZoom((z) => Math.max(0.2, z / 1.2))} onIn={() => setDetailZoom((z) => Math.min(2.2, z * 1.2))} fitTitle={t('timeline.fit')} />
        </div>
      </div>

      {/* Panel */}
      <div style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(27,26,23,0.04), 0 18px 40px -28px rgba(27,26,23,0.25)', overflow: 'hidden' }}>
        {cards.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center', color: MUTED, fontSize: 14 }}>{t('timeline.detailEmpty')}</div>
        ) : (
          <div
            ref={scrollRef}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}
            style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)', cursor: grabbing ? 'grabbing' : 'grab', overscrollBehavior: 'contain' }}
          >
            <div style={{ position: 'relative', minWidth: '100%', width: contentW, paddingBottom: 24 }}>
              {/* axis */}
              <div style={{ position: 'relative', height: 38, borderBottom: '1px solid rgba(27,26,23,0.08)' }}>
                {ticks.map((y) => (
                  <div key={y} style={{ position: 'absolute', top: 0, bottom: 0, left: (y - minY) * pxy, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                    <span style={{ fontFamily: FM, fontSize: 11.5, color: MUTED }}>{y}</span>
                  </div>
                ))}
              </div>
              {/* cards + gridlines */}
              <div style={{ position: 'relative', height: laneCount * laneH, marginTop: 18 }}>
                {ticks.map((y) => (
                  <div key={y} style={{ position: 'absolute', top: 0, bottom: 0, left: (y - minY) * pxy, width: 1, background: 'rgba(27,26,23,0.06)' }} />
                ))}
                {cards.map(({ m, left, top }) => (
                  <button
                    key={m.id}
                    data-card="1"
                    onClick={() => onActivate(m, company.name)}
                    style={{
                      position: 'absolute', left, top, width: D_CARD_W, transform: `scale(${z})`, transformOrigin: 'top left',
                      background: '#fff', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', padding: 0,
                      border: '1px solid rgba(27,26,23,0.1)',
                      boxShadow: m.owned ? `0 0 0 1.5px ${ACCENT}, 0 8px 22px -14px color-mix(in srgb, ${ACCENT} 60%, transparent)` : 'none',
                    }}
                  >
                    <div style={{ position: 'relative', aspectRatio: '4 / 3', background: m.owned ? 'linear-gradient(135deg,#EDEBFF,#E3E0FB)' : 'rgba(27,26,23,0.035)', display: 'grid', placeItems: 'center', color: '#C2BFB5', borderBottom: '1px solid rgba(27,26,23,0.06)' }}>
                      {m.imageUrl ? <img src={m.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Monitor size={38} strokeWidth={1.3} />}
                      {m.owned && (
                        <span style={{ position: 'absolute', top: 9, left: 9, display: 'flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 99, background: ACCENT, color: '#fff', fontSize: 10.5, fontWeight: 500, fontFamily: FM, letterSpacing: '0.02em' }}>
                          <span style={{ width: 6, height: 6, borderRadius: 99, background: '#fff' }} />OWNED
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '11px 13px 13px' }}>
                      <div title={m.name} style={{ fontFamily: FD, fontWeight: 600, fontSize: 15, lineHeight: 1.15, letterSpacing: '-0.01em', color: INK, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.3em' }}>{m.name}</div>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: FM, fontSize: 12, color: MUTED }}>{m.year}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: m.owned ? ACCENT : '#8C897F' }}>
                          {m.owned ? (m.exhibits.length ? t('timeline.exhibitsArrow', { count: m.exhibits.length }) : t('timeline.inCollectionArrow')) : t('timeline.wikipediaArrow')}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// --- Small controls --------------------------------------------------------
function OwnedToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none', paddingRight: 4 }}>
      <span onClick={() => onChange(!checked)} style={{ position: 'relative', width: 38, height: 22, borderRadius: 99, transition: 'background .18s', flex: 'none', background: checked ? ACCENT : 'rgba(27,26,23,0.18)' }}>
        <span style={{ position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'transform .18s', transform: checked ? 'translateX(16px)' : 'none' }} />
      </span>
      <span style={{ fontSize: 13.5, color: SEC, fontWeight: 500 }}>{label}</span>
    </label>
  );
}

function ZoomGroup({ onOut, onIn, onFit, fitTitle }: { onOut: () => void; onIn: () => void; onFit?: () => void; fitTitle: string }) {
  const btn: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 36, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', color: SEC };
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid rgba(27,26,23,0.12)', borderRadius: 9, overflow: 'hidden' }}>
      <button onClick={onOut} style={{ ...btn, borderRight: '1px solid rgba(27,26,23,0.09)' }}><ZoomOut size={16} /></button>
      <button onClick={onIn} style={{ ...btn, borderRight: onFit ? '1px solid rgba(27,26,23,0.09)' : 'none' }}><ZoomIn size={16} /></button>
      {onFit && <button onClick={onFit} style={btn} title={fitTitle}><Maximize2 size={15} /></button>}
    </div>
  );
}

