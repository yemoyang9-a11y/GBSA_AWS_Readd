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
  return (
    <main className="flex h-full flex-col bg-canvas">
      <article
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
