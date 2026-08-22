import { useEffect, useRef, useState } from 'react';

interface Options {
  onRefresh: () => Promise<unknown> | void;
  threshold?: number; // px the user must pull before refresh fires
  maxPull?: number;   // max visual offset
  /** CSS selector for the scroll container. Defaults to `main`. */
  containerSelector?: string;
}

/**
 * Minimal pull-to-refresh for the inventory list. Tracks touch events on the
 * given scroll container — only engages when the container is scrolled to
 * the top, and only on a downward touch drag. No external deps.
 *
 * Returns:
 *   bind: spread onto the scroll element (touchstart/move/end handlers)
 *   pull: current pull distance (0..maxPull) for visual indicator
 *   refreshing: true while onRefresh promise is in flight
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 70,
  maxPull = 110,
  containerSelector = 'main',
}: Options) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(containerSelector);
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      startY.current = e.touches[0]!.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0]!.clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // Resistance: only show ~50% of the actual drag distance.
      setPull(Math.min(maxPull, dy * 0.5));
    };
    const onTouchEnd = async () => {
      const startedAt = startY.current;
      startY.current = null;
      if (startedAt === null) { setPull(0); return; }
      if (pull >= threshold && !refreshing) {
        setRefreshing(true);
        try { await onRefresh(); } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, threshold, maxPull, pull, refreshing, containerSelector]);

  return { pull, refreshing };
}
