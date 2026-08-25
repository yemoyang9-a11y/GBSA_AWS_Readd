import ProgressBar from '../Reader/ProgressBar';
import TypographicCover from '../common/TypographicCover';
import type { BookSummary } from '../../types';

/**
 * 이어읽기 히어로 — 대시보드 재설계 시안 (2026-08-23, `.dash-scr .continue`)
 *
 * `BookSummary.progress`엔 `current_page`만 있다 — 총 페이지는 계약 D-1(2026-08-21)이
 * 의도적으로 뺐다(프론트가 서버 percent를 재계산할 재료가 되는 걸 막기 위해서다,
 * 절대 규칙 2번). 그래서 총 페이지는 이 컴포넌트가 자체 계산하지 않고, 컨테이너
 * (Dashboard)가 `GET /books/:id/info`(목차 마지막 장 end_page)로 따로 조회해
 * `totalPages` prop으로 내려준다 — Reader.tsx가 이미 쓰는 방식과 같다.
 *
 * "N쪽" 자리는 원래 현재 페이지(current_page)를 보여줬으나, 2026-08-25 사용자 요청으로
 * 전체 페이지 수로 바꿨다 — 진도(퍼센트)와 나란히 있으니 "지금 몇 쪽인지"보다 "총
 * 몇 쪽짜리 책인지"가 더 유용한 정보라는 판단. `totalPages`가 아직 안 왔으면(조회 중)
 * 빈 칸으로 두고 옛 값(current_page)으로 되돌아가지 않는다 — 틀린 숫자를 잠깐이라도
 * 보여주지 않기 위해서다.
 *
 * 진도가 없는 책(아직 시작 안 함)과 미완비 도서(ssabi_ready=false, FR-BRW-002 🚦)는
 * 시안에 없는 상태지만 기존 BookCard 가 다루던 게이트라 여기서도 지킨다.
 *
 * `enterable=false` (2026-08-23 데모 요청 추가) — 서재 목록의 데모 항목(실제 카탈로그에
 * 없는 정적 도서)을 미리볼 때 쓴다. ssabi_ready 와 달리 캡션·진도 문구는 그대로 두고
 * 버튼만 막는다 — "이 책은 존재하지만 아직 준비 안 됐다"가 아니라 "이 책은 데모용이라
 * 애초에 서버에 없다"는 다른 사정이라 문구를 바꾸지 않는다.
 */
export default function ContinueReadingHero({
  book,
  onResume,
  busy = false,
  enterable = true,
  totalPages = null,
}: {
  book: BookSummary;
  onResume: () => void;
  busy?: boolean;
  enterable?: boolean;
  /** 전체 페이지 수 — Dashboard가 GET /info로 조회해 내려준다. 조회 전이면 null */
  totalPages?: number | null;
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
      className="grid min-h-[265px] grid-cols-[182px_1fr_180px] items-center gap-[34px] rounded-dash-panel border border-dash-line bg-white p-[23px] shadow-dash-soft"
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
              <span>{totalPages != null ? `${totalPages}쪽` : ''}</span>
            </div>
            <div className="mt-[9px]">
              {/* size="md" — 브리핑 쪽 크기로 통일(2026-08-25, ProgressBar.tsx 주석 참조) */}
              <ProgressBar percent={book.progress!.percent} tone="dash" size="md" />
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onResume}
        disabled={!ready || busy || !enterable}
        className="justify-self-end self-end rounded-full border border-dash-ink bg-transparent px-[14px] py-2 text-xs font-bold text-dash-ink transition-colors hover:bg-[rgba(31,31,31,0.05)] active:bg-[rgba(31,31,31,0.1)] disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {buttonLabel}
      </button>
    </section>
  );
}
