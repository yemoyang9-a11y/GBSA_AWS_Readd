import { useCallback, useRef, useState } from 'react';

/**
 * 싸비 패널 드래그 리사이즈 — 시안 읽기 화면(2026-08-23, `.reader-scr .resize-handle`)
 *
 * 원본은 vanilla JS로 mousedown → mousemove(window) → mouseup(window) 리스너를 직접
 * 붙였다. 반응형으로 옮기면서 같은 흐름을 훅으로 감쌌다 — 드래그 중 폭은 항상
 * [minWidth, getMaxWidth()] 사이로 clamp된다. 핸들은 패널 **왼쪽** 모서리에 있어 마우스가
 * 왼쪽으로 갈수록(clientX가 작아질수록) 패널이 넓어진다(delta = startX - pointX).
 *
 * 패널을 닫았다 열어도 마지막 폭을 기억한다 — 이 훅의 상태(width)는 언마운트되지 않는 한
 * 유지되므로, 호출부(Reader.tsx)가 훅 자체를 계속 살려두면 자동으로 만족된다.
 */
export function usePanelResize({
  minWidth,
  getMaxWidth,
}: {
  minWidth: number;
  getMaxWidth: () => number;
}) {
  const [width, setWidth] = useState(minWidth);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(minWidth);

  const clamp = useCallback(
    (px: number) => Math.max(minWidth, Math.min(px, getMaxWidth())),
    [minWidth, getMaxWidth]
  );

  const onMove = useCallback(
    (clientX: number) => {
      const delta = startX.current - clientX;
      setWidth(clamp(startWidth.current + delta));
    },
    [clamp]
  );

  const startDrag = useCallback(
    (clientX: number) => {
      startX.current = clientX;
      startWidth.current = width;
      setIsDragging(true);

      function handleMouseMove(e: MouseEvent) {
        onMove(e.clientX);
      }
      function handleTouchMove(e: TouchEvent) {
        if (e.touches[0]) onMove(e.touches[0].clientX);
      }
      function stop() {
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', stop);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', stop);
      }

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', stop);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', stop);
    },
    [width, onMove]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startDrag(e.clientX);
    },
    [startDrag]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches[0]) startDrag(e.touches[0].clientX);
    },
    [startDrag]
  );

  return { width, isDragging, handleProps: { onMouseDown, onTouchStart } };
}
