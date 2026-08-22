import type { BookSummary } from '../../types';
import ProgressBar from '../Reader/ProgressBar';
import TypographicCover from './TypographicCover';

/**
 * 도서 카드 — 시안 book-card (폭 312px, 모서리 16px, 패딩 18px)
 *
 * 미완비 도서는 버튼을 disabled 로 둬 클릭 자체를 막는다. 이건 UI 조치일 뿐이고
 * 서버도 진입을 거절한다 — 둘 다 있어야 한다 (FR-BRW-002 🚦, R2 403 BOOK_NOT_READY).
 * 진도 percent 는 서버가 내려준 값을 그대로 넘긴다 (FR-BRF-005 🚦, 절대 규칙 2번).
 *
 * `intro_summary` 가 null 이면 소개 영역을 통째로 비운다 — 자리표시 문구를 지어내지 않는다.
 * (엔드포인트 계획 D-3 확정으로 계약에 들어왔다. 이전의 타입 캐스트를 걷어냈다.)
 */
export default function BookCard({
  book,
  onSelect,
  busy = false,
}: {
  book: BookSummary;
  onSelect: (book: BookSummary) => void;
  /** 다른 카드의 진입 왕복이 진행 중이면 잠근다 — 중복 진입을 막는다 */
  busy?: boolean;
}) {
  const intro = book.intro_summary;
  const ready = book.ssabi_ready;

  return (
    <div className="w-book-card rounded-card bg-surface p-card shadow-card">
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => onSelect(book)}
        className={`w-full text-left transition-opacity active:opacity-70${busy ? ' opacity-50' : ''}`}
      >
        <TypographicCover
          title={book.title}
          author={book.author}
          coverUrl={book.cover_url}
          dimmed={!ready}
        />

        <span className="mt-4 block truncate font-serif text-lg font-bold text-ink">
          {book.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{book.author}</span>

        {intro ? (
          <span data-testid="book-intro" className="mt-2 block line-clamp-2 text-xs leading-normal text-muted">
            {intro}
          </span>
        ) : null}
      </button>

      {/*
        "읽는 중" 라벨을 뺐다 — 같은 말이 통계 라벨·필터 탭·이 자리 세 곳에 쌓여
        서로 다른 세 의미(개수·필터·상태)를 하나로 뭉뚱그렸다. 여기서는 진도 수치만 남긴다.
      */}
      {book.progress ? (
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-1.5 text-[13px] text-muted">{book.progress.percent}% 완료</div>
          <ProgressBar percent={book.progress.percent} />
        </div>
      ) : null}

      {/*
        카드가 흐려지기만 하고 이유를 말하지 않으면, 이용자는 자기가 뭘 잘못했는지 알 수 없다.
        카드 아래쪽 같은 자리에 진도 또는 이 문구 중 하나가 온다 (FR-BRW-002 🚦).
      */}
      {!ready ? (
        <div className="mt-4 border-t border-line pt-4">
          <span className="text-[13px] text-muted">아직 준비 중입니다</span>
        </div>
      ) : null}
    </div>
  );
}
