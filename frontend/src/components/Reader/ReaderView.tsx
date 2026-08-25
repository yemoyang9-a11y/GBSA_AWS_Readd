import { useEffect, useRef, useState } from 'react';

/**
 * 읽기 화면 — S3, 재설계 2026-08-23
 *
 * 고정 페이지 + 페이지 내 스크롤. 폰트·화면 크기가 바뀌어도 페이지를 다시 나누지 않는다
 * (FR-PRG-001, 절대 규칙 10번) — 본문 영역은 스크롤 길이만 늘어난다.
 * 진도 바를 두지 않는다(FR-PRG-004) — 페이지 번호는 이제 **입력 가능한 필드**로 보여준다.
 * 이동 확정 시에만 onMove 로 알린다 — 스크롤은 이벤트를 만들지 않는다 (절대 규칙 9번).
 *
 * 이전/다음은 서버가 내려준 값(prev_page·next_page)을 그대로 쓴다. 직접 입력은 사용자가
 * 타이핑한 목표 페이지를 1~totalPages로 자른 뒤 그대로 onMove 로 넘긴다 — `fetchPage`는
 * 임의 페이지를 받는 R4 소유 엔드포인트이고 상한 대상이 아니라, 이 값을 서버 파생값으로
 * 취급할 필요가 없다.
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
  const [inputValue, setInputValue] = useState(String(currentPage));

  if (String(currentPage) !== inputValue && document.activeElement?.tagName !== 'INPUT') {
    setInputValue(String(currentPage));
  }

  function commit() {
    const n = parseInt(inputValue, 10);
    if (isNaN(n)) {
      setInputValue(String(currentPage));
      return;
    }
    const clamped = Math.max(1, Math.min(totalPages, n));
    setInputValue(String(clamped));
    if (clamped !== currentPage) onMove(clamped);
  }

  const articleRef = useRef<HTMLElement>(null);
  const [selectionPopover, setSelectionPopover] = useState<{ text: string; top: number; right: number } | null>(
    null
  );

  // 드래그가 끝난 뒤에만 팝오버를 띄운다(2026-08-25, 사용자 요청 — ChatGPT처럼).
  // selectionchange는 드래그 도중 글자 단위로 계속 발생해서, 그때마다 위치를 다시 그리면
  // 버튼이 아직 드래그 중인 문장 한가운데를 휙휙 옮겨 다니며 본문을 가린다. 그래서
  // selectionchange는 "선택이 없어졌다"는 신호로만 쓰고(다른 곳 클릭 등), 실제로 팝오버를
  // 계산해 띄우는 건 mouseup/touchend, 즉 드래그가 끝난 시점 하나뿐이다. 같은 이유로
  // mousedown/touchstart 시점엔 이전 팝오버를 바로 지운다 — 새 드래그를 시작했는데 이전
  // 선택 위치에 팝오버가 그대로 떠 있는 걸 막는다.
  useEffect(() => {
    function finalizeFromCurrentSelection() {
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
          : { top: 0, right: 0 };
      setSelectionPopover({ text, top: rect.top, right: rect.right });
    }

    function handleSelectionChange() {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) setSelectionPopover(null);
    }

    function clearPopover() {
      setSelectionPopover(null);
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

  return (
    <main className="flex h-full flex-col bg-brief-page">
      {selectionPopover && onQuote ? (
        <button
          type="button"
          style={{ top: selectionPopover.top - 10, left: selectionPopover.right }}
          className="fixed z-20 -translate-y-full whitespace-nowrap rounded-2xl rounded-br-md border border-brief-accent bg-brief-accent-soft px-3.5 py-2 text-[11px] font-bold text-brief-accent shadow-brief-soft-sm"
          onMouseDown={(event) => {
            // mousedown 이 먼저 발생해 포커스가 옮겨가면 클릭 전에 선택이 풀린다 — 막는다.
            // (위 document mousedown 리스너가 팝오버를 지우는 것도 이 버튼 자체는 피해야 하므로
            // stopPropagation으로 버블링을 끊는다.)
            event.preventDefault();
            event.stopPropagation();
          }}
          onTouchStart={(event) => {
            // 태블릿에서 버튼을 탭할 때도 위 document touchstart 리스너가 먼저 팝오버를
            // 지워버리지 않게 막는다 (NFR-USE 태블릿 우선).
            event.stopPropagation();
          }}
          onClick={() => {
            onQuote(selectionPopover.text);
            document.getSelection()?.removeAllRanges();
            setSelectionPopover(null);
          }}
        >
          아모에게 물어보기
        </button>
      ) : null}

      {/*
       * 스크롤은 이 바깥 div가 맡는다(2026-08-24, 사용자 피드백) — article 자체에
       * overflow를 걸면 스크롤바가 글줄(max-w-[560px])의 오른쪽 끝, 즉 화면 가운데
       * 애매한 위치에 뜬다. 읽기 영역 전체 폭에 스크롤을 걸어야 스크롤바가 싸비
       * 패널의 왼쪽 경계와 같은 자리(오른쪽 끝)에 붙는다. 글줄 너비 제한은 안쪽
       * article에 그대로 둬서 가독성엔 영향이 없다.
       */}
      <div className="brief-scroll flex-1 overflow-y-auto">
        <article
          ref={articleRef}
          role="article"
          className="mx-auto w-full max-w-[560px] whitespace-pre-wrap px-8 pb-10 pt-[60px] font-dashSerif text-[18px] leading-[2] text-brief-ink"
        >
          {content}
        </article>
      </div>

      <nav className="flex items-center justify-between border-t border-brief-rule px-8 py-3.5 font-dashSans text-[13px] text-brief-muted">
        <button
          type="button"
          disabled={prevPage === null}
          onClick={() => prevPage !== null && onMove(prevPage)}
          className="disabled:opacity-40"
        >
          이전 페이지
        </button>

        <div className="flex items-baseline gap-1.5 font-dashMono text-[13px] font-medium text-brief-ink">
          <input
            type="text"
            inputMode="numeric"
            aria-label="페이지로 이동"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={commit}
            className="w-[3ch] border-0 border-b border-dashed border-brief-rule bg-transparent text-center font-inherit text-inherit outline-none focus:border-b-[1.5px] focus:border-solid focus:border-brief-accent focus:bg-brief-accent-soft"
          />
          <span className="text-brief-muted">/ {totalPages}</span>
        </div>

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
