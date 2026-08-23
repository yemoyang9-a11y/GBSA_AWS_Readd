import { useState } from 'react';

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
 */
export default function ReaderView({
  content,
  currentPage,
  totalPages,
  prevPage,
  nextPage,
  onMove,
}: {
  content: string;
  currentPage: number;
  totalPages: number;
  prevPage: number | null;
  nextPage: number | null;
  onMove: (page: number) => void;
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

  return (
    <main className="flex h-full flex-col bg-brief-page">
      <article
        role="article"
        className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto whitespace-pre-wrap px-8 pb-10 pt-[60px] font-dashSerif text-[18px] leading-[2] text-[#332e22]"
      >
        {content}
      </article>

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
