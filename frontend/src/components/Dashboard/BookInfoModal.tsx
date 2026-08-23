import { useEffect } from 'react';
import TypographicCover from '../common/TypographicCover';
import type { BookSummary } from '../../types';
import type { BookInfoContent } from '../../data/bookInfoContent';

/**
 * 도서 소개 모달 — 서재 카드의 "i" 버튼이 연다 (2026-08-23 사용자 요청).
 *
 * 표지 + 진도 배지(왼쪽) · 제목·태그·저자·소개·배경 지식(오른쪽) 2단 레이아웃 —
 * 사용자가 준 참고 UI의 배치를 따르되, 색·서체·모서리는 대시보드 재설계 톤(dash-*)에
 * 맞췄다. `content`가 없으면(정적 데이터에 없는 book_id) 아무것도 그리지 않는다 —
 * 없는 소개를 지어내지 않는다.
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
        className="grid w-full max-w-[720px] grid-cols-[220px_1fr] gap-8 rounded-dash-panel bg-white p-8 shadow-dash-soft"
      >
        <div>
          <TypographicCover size="hero" title={book.title} author={book.author} coverUrl={book.cover_url} />
          {book.progress ? (
            <div className="mt-3 flex items-center gap-1.5 font-dashSans text-xs text-dash-muted">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-dash-ink" />
              이어 읽는 중 · {book.progress.percent}% 읽음
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
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dash-line font-dashSans text-dash-muted transition-colors hover:border-dash-ink hover:text-dash-ink"
            >
              ×
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {content.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-[999px] bg-dash-paper px-3 py-1 font-dashSans text-xs text-dash-muted"
              >
                {tag}
              </span>
            ))}
          </div>

          <p className="mt-3 font-dashSans text-sm text-dash-muted">{book.author}</p>

          <hr className="my-5 border-dash-line" />

          <section>
            <h3 className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">
              도서 소개
            </h3>
            <p className="mt-2 font-dashSans text-sm leading-relaxed text-dash-ink">{content.intro}</p>
          </section>

          <section className="mt-5">
            <h3 className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">
              배경 지식
            </h3>
            <ul className="mt-2 space-y-2">
              {content.background.map((item) => (
                <li
                  key={item}
                  className="font-dashSans text-sm leading-relaxed text-dash-ink before:mr-2 before:content-['▪']"
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
