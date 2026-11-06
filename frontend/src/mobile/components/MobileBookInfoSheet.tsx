import { useEffect, useRef } from 'react';
import TypographicCover from '../../components/common/TypographicCover';
import { useModalLayer } from '../../hooks/useModalLayer';
import type { BookInfoContent } from '../../data/bookInfoContent';
import type { BookSummary } from '../../types';

// FR-BRW-003 R5
export default function MobileBookInfoSheet({
  book,
  content,
  onClose,
}: {
  book: BookSummary;
  content: BookInfoContent | undefined;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  useModalLayer({ active: Boolean(content), dialogRef, returnFocusRef, onClose });

  useEffect(() => {
    if (!content) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [content]);

  if (!content) return null;

  return (
    <div data-testid="book-info-overlay" onClick={onClose} className="fixed inset-0 z-50 bg-black/40">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="brief-scroll absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[20px] bg-brief-paper px-5 pt-2 font-dashSans text-brief-ink shadow-brief-soft outline-none"
        style={{ paddingBottom: 'max(24px, var(--safe-bottom))' }}
      >
        <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-brief-rule" />
        <div className="flex items-center justify-between">
          <p className="min-w-0 text-[11px] font-bold tracking-[.08em] text-brief-accent">{content.tags.join(' · ')}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-brief-accent"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-2 flex items-end gap-4">
          <span className="shrink-0 [&>div]:px-2">
            <TypographicCover size="row" title={book.title} author={book.author} coverUrl={book.cover_url} />
          </span>
          <div className="min-w-0">
            <h2 className="break-keep font-dashSerif text-[26px] font-bold leading-tight tracking-[-.02em]">{book.title}</h2>
            <p className="mt-1.5 font-dashSerif text-[13px] italic text-brief-muted">{book.author} 지음</p>
            {book.progress ? (
              <p className="mt-2 text-[13px] text-brief-muted">{book.progress.percent}%까지 읽음</p>
            ) : null}
          </div>
        </div>

        <hr className="my-5 border-brief-rule" />

        <section>
          <h3 className="text-[15px] font-bold tracking-[.06em] text-brief-accent">도서 소개</h3>
          <p className="mt-2 break-keep text-[15px] leading-relaxed">{content.intro}</p>
        </section>

        <section className="mt-6">
          <h3 className="text-[15px] font-bold tracking-[.06em] text-brief-accent">배경 지식</h3>
          <div className="mt-2.5 space-y-3">
            {content.background.map((item, index) => (
              <div key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-brief-accent-soft text-xs font-bold text-brief-accent">
                  {index + 1}
                </span>
                <p className="min-w-0 break-keep text-[15px] leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
