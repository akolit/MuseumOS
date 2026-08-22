import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

// Easter egg: a 404 renders the Amiga's classic "Guru Meditation" crash screen —
// a black screen with a wide red box whose BORDER blinks (the text stays steady).
// "Press left mouse button to continue" (any click or key) returns to the dashboard.
export function NotFoundPage() {
  const navigate = useNavigate();

  // A plausible Guru error code, e.g. #0000000A.0048AF20 (8 hex . 8 hex).
  const code = useMemo(() => {
    const rnd = (n: number) =>
      Array.from({ length: n }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
    return `#${rnd(8)}.${rnd(8)}`;
  }, []);

  const dismiss = () => navigate('/');

  useEffect(() => {
    const onKey = () => dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onMouseDown={dismiss}
      role="alertdialog"
      aria-label="Page not found. Click anywhere or press any key to return to the dashboard."
      className="fixed inset-0 z-[9999] flex cursor-pointer select-none items-start justify-center bg-black"
      style={{ paddingTop: '8vh' }}
    >
      {/* Only the red border blinks; the text stays solid (as on the Amiga). */}
      <style>{`@keyframes guru-border { 0%,49% { border-color: #FF1A1A } 50%,100% { border-color: transparent } }`}</style>
      <span className="sr-only">404 — page not found. Click anywhere to return home.</span>
      <div
        aria-hidden="true"
        style={{
          width: 'min(92vw, 1120px)',
          border: '3px solid #FF1A1A',
          color: '#FF1A1A',
          fontFamily: 'ui-monospace, "Topaz", "Courier New", Courier, monospace',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textAlign: 'center',
          padding: '16px 24px',
          animation: 'guru-border 1.06s steps(1, end) infinite',
        }}
      >
        <div style={{ fontSize: 'clamp(11px, 2.1vw, 18px)', lineHeight: 1.8 }}>
          Software Failure 404.&nbsp;&nbsp;Press left mouse button to continue.
        </div>
        <div style={{ fontSize: 'clamp(11px, 2.1vw, 18px)', lineHeight: 1.8 }}>
          Guru Meditation {code}
        </div>
      </div>
    </div>
  );
}
