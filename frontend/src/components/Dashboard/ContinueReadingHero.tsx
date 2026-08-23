import ProgressBar from '../Reader/ProgressBar';
import TypographicCover from '../common/TypographicCover';
import type { BookSummary } from '../../types';

/**
 * 이어읽기 히어로 — 대시보드 재설계 시안 (2026-08-23, `.dash-scr .continue`)
 *
 * 시안은 진도(current/total)를 "72 / 285쪽"으로 보여주지만 `BookSummary.progress`엔
 * `current_page`만 있다 — 총 페이지는 계약 D-1(2026-08-21)이 의도적으로 뺐다. 분수를
 * 만들면 서버에 없는 값을 프론트가 지어내는 것이라 절대 규칙 2번 위반이다. 그래서
 * 여기는 현재 페이지만 단독 표시한다.
 *
 * 진도가 없는 책(아직 시작 안 함)과 미완비 도서(ssabi_ready=false, FR-BRW-002 🚦)는
 * 시안에 없는 상태지만 기존 BookCard 가 다루던 게이트라 여기서도 지킨다.
 */
export default function ContinueReadingHero({
  book,
  onResume,
  busy = false,
}: {
  book: BookSummary;
  onResume: () => void;
  busy?: boolean;
}) {
  const hasProgress = book.progress !== undefined;
  const ready = book.ssabi_ready;

  const caption = !ready ? '준비 중' : hasProgress ? 'CONTINUE READING' : '새로 시작하기';
  const buttonLabel = !ready
    ? '아직 준비 중입니다'
    : busy
      ? '여는 중'
      : hasProgress
        ? '이어서 읽기'
        : '읽기 시작';

  return (
    <section
      aria-live="polite"
      className="grid min-h-[265px] grid-cols-[182px_1fr_180px] items-center gap-[34px] border border-dash-line bg-white p-[23px]"
    >
      <TypographicCover
        size="hero"
        title={book.title}
        author={book.author}
        coverUrl={book.cover_url}
        dimmed={!ready}
      />

      <div>
        <p className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">
          {caption}
        </p>
        <h2 className="mt-[9px] font-dashSerif text-[27px] font-semibold tracking-[-.07em] text-dash-ink">
          {book.title}
        </h2>
        <p className="m-0 text-sm text-dash-muted">{book.author}</p>

        {ready && hasProgress ? (
          <div className="mt-[31px]">
            <div className="flex justify-between text-sm text-[#555]">
              <span>{book.progress!.percent}% 완료</span>
              <span>{book.progress!.current_page}쪽</span>
            </div>
            <div className="mt-[9px]">
              <ProgressBar percent={book.progress!.percent} tone="dash" />
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onResume}
        disabled={!ready || busy}
        className="justify-self-end self-end rounded-full border border-dash-ink bg-transparent px-[14px] py-2 text-xs font-bold text-dash-ink transition-opacity disabled:opacity-40"
      >
        {buttonLabel}
      </button>
    </section>
  );
}
