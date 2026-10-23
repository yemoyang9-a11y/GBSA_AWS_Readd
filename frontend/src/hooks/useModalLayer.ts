import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * 전체화면 오버레이(role="dialog", aria-modal)가 열려 있는 동안의 키보드 동작.
 * 열리면 대화상자로 포커스를 옮기고, Esc로 닫고, 닫히면 연 버튼으로 포커스를 돌려준다.
 *
 * `onClose`는 호출부가 매 렌더 새 함수를 넘기는 게 보통이라 ref에 담아 둔다 — 의존성에
 * 넣으면 렌더마다 effect가 정리·재실행되며 포커스가 반복해서 이동·복귀한다.
 */
export function useModalLayer({
  active,
  dialogRef,
  returnFocusRef,
  onClose,
}: {
  active: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    dialogRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [active, dialogRef, returnFocusRef]);
}
