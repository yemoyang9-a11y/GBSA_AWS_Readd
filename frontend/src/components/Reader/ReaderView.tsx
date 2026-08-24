import { useEffect, useRef, useState } from 'react';
import { formatPageIndicator } from '../../utils/format';

/**
 * 읽기 화면 — S3
 *
 * 고정 페이지 + 페이지 내 스크롤. 폰트·화면 크기가 바뀌어도 페이지를 다시 나누지 않는다
 * (FR-PRG-001, 절대 규칙 10번) — 본문 영역은 스크롤 길이만 늘어난다.
 * 페이지 번호만 표시하고 진도 바를 두지 않는다 (FR-PRG-004).
 * 이동 확정 시에만 onMove 로 알린다 — 스크롤은 이벤트를 만들지 않는다 (절대 규칙 9번).
 *
 * 이동할 페이지 번호는 서버가 내려준 값(prev_page·next_page)을 그대로 쓴다. 프론트에서
 * 페이지 산술을 하지 않으므로 파생값 단일 원천 규칙과 충돌할 여지가 없다 (절대 규칙 2번).
 *
 * 문장 드래그 → 챗봇 인용. 선택 자체는 이미 화면에 떠 있는(=이미 열람 가능한) 본문
 * 텍스트라 R3(본문 접근은 제한하지 않는다)와 충돌하지 않는다 — 챗봇 질문(query)은 원래도
 * 자유 텍스트로 cutoff 필터링 대상이 아니므로, 드래그는 타이핑 대신 인용하는 UX일 뿐
 * 새 우회 경로를 만들지 않는다. onQuote 는 선택한 문자열만 부모로 올려 보낸다.
 */
export default function ReaderView({
  content,
  currentPage,
  totalPages,
  prevPage,
  nextPage,
  onMove,
  onQuote,
}: {
  content: string;
  currentPage: number;
  totalPages: number;
  prevPage: number | null;
  nextPage: number | null;
  onMove: (page: number) => void;
  onQuote?: (text: string) => void;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const [selectionPopover, setSelectionPopover] = useState<{ text: string; top: number; left: number } | null>(
    null
  );

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      const text = selection?.toString().trim() ?? '';

      if (!text || !selection || selection.rangeCount === 0 || !articleRef.current) {
        setSelectionPopover(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!articleRef.current.contains(range.commonAncestorContainer)) {
        setSelectionPopover(null);
        return;
      }

      // jsdom(테스트 환경)엔 Range.getBoundingClientRect가 없다 — 실제 브라우저에서만 위치를 잰다
      const rect =
        typeof range.getBoundingClientRect === 'function'
          ? range.getBoundingClientRect()
          : { top: 0, left: 0, width: 0 };
      setSelectionPopover({ text, top: rect.top, left: rect.left + rect.width / 2 });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  return (
    <main className="flex h-full flex-col bg-canvas">
      {selectionPopover && onQuote ? (
        <button
          type="button"
          style={{ top: selectionPopover.top - 44, left: selectionPopover.left }}
          className="fixed z-20 -translate-x-1/2 whitespace-nowrap rounded-pill border border-ssabi bg-ssabi-soft px-3 py-1.5 text-[11px] font-bold text-ssabi shadow-sm"
          onMouseDown={(event) => {
            // mousedown 이 먼저 발생해 포커스가 옮겨가면 클릭 전에 선택이 풀린다 — 막는다.
            event.preventDefault();
          }}
          onClick={() => {
            onQuote(selectionPopover.text);
            document.getSelection()?.removeAllRanges();
            setSelectionPopover(null);
          }}
        >
          싸비에게 질문하기
        </button>
      ) : null}

      <article
        ref={articleRef}
        role="article"
        className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto whitespace-pre-wrap px-8 pb-10 pt-[60px] font-serif text-[18px] leading-[2] text-ink"
      >
        {content}
      </article>

      <nav className="flex items-center justify-between border-t border-line px-8 py-4 text-[13px] text-muted">
        <button
          type="button"
          disabled={prevPage === null}
          onClick={() => prevPage !== null && onMove(prevPage)}
          className="disabled:opacity-40"
        >
          이전 페이지
        </button>

        <span className="font-sans text-ink">{formatPageIndicator(currentPage, totalPages)}</span>

        <button
          type="button"
          disabled={nextPage === null}
          onClick={() => nextPage !== null && onMove(nextPage)}
          className="disabled:opacity-40"
        >
          다음 페이지
        </button>
      </nav>
    </main>
  );
}
