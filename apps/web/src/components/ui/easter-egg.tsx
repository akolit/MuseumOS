import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  imageSrc: string;
  onClose: () => void;
  /** ms the image stays fully visible before exit animation */
  holdMs?: number;
}

type Phase = 'enter' | 'hold' | 'exit';

export function EasterEggOverlay({ open, imageSrc, onClose, holdMs = 2000 }: Props) {
  const [phase, setPhase] = useState<Phase>('enter');
  // Keep latest onClose in a ref so we don't re-run the animation effect
  // when the parent re-renders with a new inline arrow function.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) {
      setPhase('enter');
      return;
    }
    // Schedule the transitions. Use a tiny timeout (rather than rAF) so the
    // browser definitely paints the entrance frame first.
    setPhase('enter');
    const t0 = setTimeout(() => setPhase('hold'), 20);
    const t1 = setTimeout(() => setPhase('exit'), holdMs);
    const t2 = setTimeout(() => onCloseRef.current(), holdMs + 700);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open, holdMs]);

  if (!open) return null;

  const backdropClass =
    phase === 'enter' || phase === 'exit'
      ? 'opacity-0'
      : 'opacity-100';

  let imageClass = 'scale-50 rotate-[-8deg] opacity-0';
  if (phase === 'hold') imageClass = 'scale-100 rotate-0 opacity-100';
  else if (phase === 'exit') imageClass = 'scale-150 rotate-[12deg] opacity-0 blur-md';

  return createPortal(
    <div
      className={`pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-500 ${backdropClass}`}
      aria-hidden="true"
    >
      <div
        className={`relative will-change-transform transition-all duration-700 ease-out ${imageClass}`}
        style={{ filter: phase === 'hold' ? 'drop-shadow(0 25px 50px rgba(0,0,0,0.5))' : undefined }}
      >
        <img
          src={imageSrc}
          alt="President Approves"
          className="block max-h-[70vh] max-w-[80vw] rounded-2xl"
          draggable={false}
        />
        {/* Sparkle accents — pure CSS, no extra deps */}
        <div className="absolute -top-6 -left-6 text-4xl select-none animate-ping">✨</div>
        <div className="absolute -top-4 -right-8 text-3xl select-none animate-pulse">⭐</div>
        <div className="absolute -bottom-4 -right-6 text-4xl select-none animate-ping">✨</div>
        <div className="absolute -bottom-6 -left-4 text-3xl select-none animate-pulse">🎉</div>
      </div>
    </div>,
    document.body,
  );
}
