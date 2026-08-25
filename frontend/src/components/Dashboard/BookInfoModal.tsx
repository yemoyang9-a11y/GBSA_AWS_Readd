import { useEffect } from 'react';
import TypographicCover from '../common/TypographicCover';
import type { BookSummary } from '../../types';
import type { BookInfoContent } from '../../data/bookInfoContent';

const PROGRESS_RING_RADIUS = 7;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;

/**
 * 도서 소개 모달 — 서재 카드의 "i" 버튼이 연다 (2026-08-23 사용자 요청).
 *
 * 표지 + 진도 배지(왼쪽) · 제목·태그·저자·소개·배경 지식(오른쪽) 2단 레이아웃 —
 * 사용자가 준 참고 UI의 배치를 따르되, 서체·모서리는 대시보드 재설계 톤(dash-*)에
 * 맞췄다. `content`가 없으면(정적 데이터에 없는 book_id) 아무것도 그리지 않는다 —
 * 없는 소개를 지어내지 않는다.
 *
 * 강조색은 대시보드 전용 톤(무채색)이 아니라 기존 `ssabi` 테라코타를 재사용한다
 * (2026-08-23, "텍스트만 있어 눈에 안 들어온다" 피드백). 새 색을 만드는 대신
 * 이미 이 앱에 있는 강조색 하나를 그대로 가져다 썼다 — 대시보드 톤에 색을 새로
 * 얹으면 서재 화면 전체가 흔들리지만, 이 모달은 자기 완결적인 오버레이라 영향이 없다.
 */
export default function BookInfoModal({
  book,
  content,
  onClose,
}: {
  book: BookSummary;
  content: BookInfoContent | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!content) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [content, onClose]);

  if (!content) return null;

  return (
    <div
      data-testid="book-info-overlay"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        onClick={(e) => e.stopPropagation()}
        // 156px = h-hero-cover(219px) × row-cover 비율(84/118) — 서재 카드 표지와 같은 세로형 비율로 맞춤(2026-08-25 요청)
        className="grid w-full max-w-[720px] grid-cols-[156px_1fr] gap-8 rounded-dash-panel bg-white p-8 shadow-dash-soft"
      >
        <div>
          <TypographicCover size="hero" title={book.title} author={book.author} coverUrl={book.cover_url} />
          {book.progress ? (
            <div className="mt-3 flex justify-center">
              <div className="flex items-center gap-1.5 rounded-full border border-dash-line bg-white px-3 py-1.5 font-dashSans text-xs text-dash-muted">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <circle
                    cx="9"
                    cy="9"
                    r={PROGRESS_RING_RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-dash-line"
                  />
                  <circle
                    cx="9"
                    cy="9"
                    r={PROGRESS_RING_RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
                    strokeDashoffset={PROGRESS_RING_CIRCUMFERENCE * (1 - book.progress.percent / 100)}
                    transform="rotate(-90 9 9)"
                    className="text-ssabi"
                  />
                </svg>
                {book.progress.percent}%까지 읽음
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <div className="flex items-start justify-between">
            <h2 className="font-dashSerif text-[28px] font-semibold tracking-[-.03em] text-dash-ink">
              {book.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-ssabi opacity-70 transition hover:bg-ssabi-soft hover:opacity-100"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {content.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-[999px] bg-ssabi-soft px-3 py-1 font-dashSans text-xs text-ssabi"
              >
                {tag}
              </span>
            ))}
          </div>

          <p className="mt-3 font-dashSans text-sm text-dash-muted">{book.author}</p>

          <hr className="my-5 border-dash-line" />

          <section>
            <h3 className="font-dashSans text-base font-bold text-ssabi">
              도서 소개
            </h3>
            <p className="mt-2 font-dashSans text-sm leading-relaxed text-dash-ink">{content.intro}</p>
          </section>

          <section className="mt-5">
            <h3 className="font-dashSans text-base font-bold text-ssabi">
              배경 지식
            </h3>
            <ul className="mt-2 space-y-2">
              {content.background.map((item) => (
                <li
                  key={item}
                  className="font-dashSans text-sm leading-relaxed text-dash-ink before:mr-2 before:text-ssabi before:content-['▪']"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
