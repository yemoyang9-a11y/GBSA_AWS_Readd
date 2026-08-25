import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuoteSelection } from '../../hooks/useQuoteSelection';
import QuotePopover from '../common/QuotePopover';

/**
 * 인용된 문장을 본문 안에서 하이라이트한다(2026-08-25, 사용자 요청 — "선택한 문장이
 * 본문에서도 표시되었으면"). 드래그 선택이 원문에서 그대로 뽑아낸 부분 문자열이라
 * 정확히 일치하는 자리를 찾으면 되고, 혹시 못 찾으면(페이지가 바뀌었거나 등) 그냥
 * 강조 없이 원문을 그대로 보여준다 — 없는 자리를 지어내 표시하지 않는다.
 * 같은 문장이 본문에 여러 번 나오면 전부 강조한다 — 실제로 고른 자리 하나만 골라낼
 * 방법이 없어서, 놓치는 것보다는 안전한 쪽을 택했다.
 */
function highlightContent(content: string, highlight: string | null): ReactNode {
  if (!highlight) return content;
  const idx = content.indexOf(highlight);
  if (idx === -1) return content;

  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = idx;
  let key = 0;
  while (matchIndex !== -1) {
    if (matchIndex > cursor) parts.push(content.slice(cursor, matchIndex));
    parts.push(
      <mark
        key={key++}
        className="rounded-[2px] bg-brief-accent-soft text-brief-ink"
        style={{ boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
      >
        {content.slice(matchIndex, matchIndex + highlight.length)}
      </mark>
    );
    cursor = matchIndex + highlight.length;
    matchIndex = content.indexOf(highlight, cursor);
  }
  if (cursor < content.length) parts.push(content.slice(cursor));
  return parts;
}

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
 *
 * 인용 하이라이트(2026-08-25, 사용자 요청) — 챗봇의 "선택한 문장" 카드에 떠 있는 원문을
 * `highlightedQuote`로 받아 본문 안에서 강조한다. Reader.tsx가 카드와 같은 값을 들고
 * 있다가 카드가 지워지면(×·새 채팅·다른 대화 선택) 이것도 같이 지운다 — 두 표시가
 * 서로 다른 상태로 갈라지지 않게 한다.
 */
export default function ReaderView({
  content,
  currentPage,
  totalPages,
  prevPage,
  nextPage,
  onMove,
  onQuote,
  highlightedQuote,
}: {
  content: string;
  currentPage: number;
  totalPages: number;
  prevPage: number | null;
  nextPage: number | null;
  onMove: (page: number) => void;
  onQuote?: (text: string) => void;
  /** 챗봇 "선택한 문장" 카드에 지금 떠 있는 원문(2026-08-25, 사용자 요청) — 이 페이지
   *  본문 안에 있으면 강조한다. */
  highlightedQuote?: string | null;
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

  const { containerRef: articleRef, popover: selectionPopover, clearPopover } = useQuoteSelection<HTMLElement>();

  return (
    <main className="flex h-full flex-col bg-brief-page">
      <QuotePopover popover={selectionPopover} onQuote={onQuote} onDone={clearPopover} />

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
          {highlightContent(content, highlightedQuote ?? null)}
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
