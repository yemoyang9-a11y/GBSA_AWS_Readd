import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { decideSwipe } from './swipeDecision';

const AXIS_LOCK_DISTANCE = 10;
const EDGE_RESISTANCE = 0.3;
const VELOCITY_WINDOW_MS = 100;
export const SETTLE_MS = 220;

interface Sample {
  x: number;
  t: number;
}

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  axis: 'x' | 'y' | null;
  samples: Sample[];
}

function hasTextSelection(): boolean {
  return (document.getSelection()?.toString() ?? '').length > 0;
}

// FR-PRG-003 🚦 FR-PRG-001 🚦
export function useSwipePager<T extends HTMLElement>(o: {
  hasPrev: boolean;
  hasNext: boolean;
  onNext: () => void;
  onPrev: () => void;
  disabled: boolean;
}) {
  const targetRef = useRef<T>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const settlingRef = useRef(false);
  const settleTimerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(settleTimerRef.current), []);

  const moveTarget = useCallback((x: number, animate: boolean) => {
    const el = targetRef.current;
    if (!el) return;
    el.style.transition = animate ? `transform ${SETTLE_MS}ms ease-out` : '';
    el.style.transform = x === 0 ? '' : `translateX(${x}px)`;
  }, []);

  const settle = useCallback(
    (target: number, then?: () => void) => {
      settlingRef.current = true;
      moveTarget(target, true);
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = window.setTimeout(() => {
        then?.();
        moveTarget(0, false);
        settlingRef.current = false;
      }, SETTLE_MS);
    },
    [moveTarget]
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (o.disabled || settlingRef.current || !e.isPrimary || hasTextSelection()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const now = performance.now();
      gestureRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        axis: null,
        samples: [{ x: e.clientX, t: now }],
      };
    },
    [o.disabled]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (g.axis === null) {
        if (Math.hypot(dx, dy) < AXIS_LOCK_DISTANCE) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (g.axis === 'x') e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      if (g.axis !== 'x') return;
      const now = performance.now();
      g.samples = [...g.samples.filter((it) => now - it.t <= VELOCITY_WINDOW_MS), { x: e.clientX, t: now }];
      const blocked = (dx < 0 && !o.hasNext) || (dx > 0 && !o.hasPrev);
      moveTarget(blocked ? dx * EDGE_RESISTANCE : dx, false);
    },
    [o.hasNext, o.hasPrev, moveTarget]
  );

  const finish = useCallback(
    (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      gestureRef.current = null;
      if (g.axis !== 'x') return;
      const width = e.currentTarget.clientWidth || window.innerWidth;
      const now = performance.now();
      const recent = g.samples.filter((it) => now - it.t <= VELOCITY_WINDOW_MS);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const elapsed = first && last ? last.t - first.t : 0;
      const velocityX = elapsed > 0 ? (last.x - first.x) / elapsed : 0;
      const decision = cancelled
        ? 'cancel'
        : decideSwipe({
            dx: e.clientX - g.startX,
            dy: e.clientY - g.startY,
            velocityX,
            width,
            hasPrev: o.hasPrev,
            hasNext: o.hasNext,
          });
      if (decision === 'next') settle(-width, o.onNext);
      else if (decision === 'prev') settle(width, o.onPrev);
      else settle(0);
    },
    [o.hasNext, o.hasPrev, o.onNext, o.onPrev, settle]
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => finish(e, false), [finish]);
  const onPointerCancel = useCallback((e: ReactPointerEvent<HTMLElement>) => finish(e, true), [finish]);

  return { targetRef, bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
