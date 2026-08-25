import { useEffect, useRef, useState } from 'react';

export interface QuoteSelectionPopover {
  text: string;
  top: number;
  bottom: number;
  right: number;
}

/**
 * 드래그 선택 → "아모에게 물어보기" 팝오버 (2026-08-25).
 *
 * 원래 ReaderView(본문)에만 있던 로직을 RecapTab(리캡)도 같이 쓰도록 훅으로 뽑았다 —
 * 리캡 텍스트도 이미 K 이하로만 만들어진 표시값이라(R2 불변식) 본문과 동급으로
 * "이미 열람 가능한 확정 텍스트"이므로, 같은 인용 예외 경로를 하나 더 연결하는 것뿐이다.
 * 새 cutoff 판정 로직은 없다 — 어느 컨테이너에서 선택이 끝났는지만 가린다.
 *
 * 드래그가 끝난(mouseup/touchend) 시점에만 팝오버를 계산해 띄운다 — selectionchange는
 * 드래그 도중 글자 단위로 계속 발생해서, 그때마다 위치를 다시 그리면 버튼이 아직 드래그
 * 중인 문장 한가운데를 휙휙 옮겨 다니며 본문을 가린다(2026-08-25, 사용자 요청 —
 * ChatGPT처럼). selectionchange는 "선택이 없어졌다"는 신호로만 쓰고(다른 곳 클릭 등),
 * mousedown/touchstart 시점엔 이전 팝오버를 바로 지운다 — 새 드래그를 시작했는데 이전
 * 선택 위치에 팝오버가 그대로 떠 있는 걸 막는다.
 *
 * 같은 페이지에 이 훅을 여러 컨테이너(본문·리캡)가 동시에 쓸 수 있다 — 각자 자기
 * containerRef 안에서 끝난 선택에만 반응하고, 다른 컨테이너에서 끝난 선택은 무시(자기
 * 팝오버를 지움)한다.
 */
export function useQuoteSelection<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const [popover, setPopover] = useState<QuoteSelectionPopover | null>(null);

  useEffect(() => {
    function finalizeFromCurrentSelection() {
      const selection = document.getSelection();
      const text = selection?.toString().trim() ?? '';

      if (!text || !selection || selection.rangeCount === 0 || !containerRef.current) {
        setPopover(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        setPopover(null);
        return;
      }

      // jsdom(테스트 환경)엔 Range.getBoundingClientRect가 없다 — 실제 브라우저에서만 위치를 잰다
      const rect =
        typeof range.getBoundingClientRect === 'function'
          ? range.getBoundingClientRect()
          : { top: 0, bottom: 0, right: 0 };
      setPopover({ text, top: rect.top, bottom: rect.bottom, right: rect.right });
    }

    function handleSelectionChange() {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) setPopover(null);
    }

    function clearPopover() {
      setPopover(null);
    }

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousedown', clearPopover);
    document.addEventListener('touchstart', clearPopover);
    document.addEventListener('mouseup', finalizeFromCurrentSelection);
    document.addEventListener('touchend', finalizeFromCurrentSelection);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', clearPopover);
      document.removeEventListener('touchstart', clearPopover);
      document.removeEventListener('mouseup', finalizeFromCurrentSelection);
      document.removeEventListener('touchend', finalizeFromCurrentSelection);
    };
  }, []);

  return { containerRef, popover, clearPopover: () => setPopover(null) };
}
