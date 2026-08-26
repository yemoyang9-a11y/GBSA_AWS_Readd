import { useEffect } from 'react';
import TypographicCover from '../common/TypographicCover';
import type { BookSummary } from '../../types';
import type { BookInfoContent } from '../../data/bookInfoContent';

const PROGRESS_RING_RADIUS = 7;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;

/**
 * 도서 소개 모달 — 서재 카드의 "i" 버튼이 연다 (2026-08-23 사용자 요청).
 *
 * 표지 + 진도 배지(왼쪽) · 제목·태그·저자·소개·배경 지식(오른쪽) 2단 레이아웃.
 * `content`가 없으면(정적 데이터에 없는 book_id) 아무것도 그리지 않는다 —
 * 없는 소개를 지어내지 않는다.
 *
 * 강조색은 대시보드 전용 톤(무채색)이나 `ssabi` 테라코타가 아니라 싸비 사이드바
 * (`brief-*`)의 세이지 그린 톤을 재사용한다(2026-08-26, "싸비 화면과 색감을
 * 맞춰달라"는 요청). 이 모달은 자기 완결적인 오버레이라 대시보드 화면 자체의
 * 무채색 톤에는 영향이 없다.
 *
 * 오른쪽 패널은 "에디토리얼 바이라인" 시안(7개 중 사용자 선택, 2026-08-26) —
 * 태그를 큰 필박스 대신 제목 위 얇은 라벨로, 저자를 "지음" 붙인 세리프 바이라인으로
 * 바꿨다. "도서 소개"·"배경 지식" 소제목은 이후 1.5배로 키웠고(2026-08-26), 배경
 * 지식 항목은 좌측 인용선(blockquote) 대신 원형 순번 배지 시안(5개 중 사용자 선택,
 * 2026-08-26)으로 바꿨다.
 *
 * 닫기 버튼은 처음엔 제목과 같은 줄(기존 구현 그대로, 사용자 명시 요청)이었다가,
 * 태그 라벨 줄이 제목 위로 올라오면서 사용자가 버튼을 태그 줄 높이로 옮겨달라고
 * 요청해(2026-08-26) 지금은 태그 문단과 한 줄(flex justify-between)에 있다 —
 * 오른쪽 위 위치·크기·hover 스타일 자체는 그대로다.
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
        className="grid w-full max-w-[720px] grid-cols-[156px_1fr] gap-8 rounded-dash-panel bg-brief-paper p-8 shadow-brief-soft"
      >
        <div>
          <TypographicCover size="hero" title={book.title} author={book.author} coverUrl={book.cover_url} />
          {book.progress ? (
            <div className="mt-3 flex justify-center">
              <div className="flex items-center gap-1.5 rounded-full border border-brief-rule bg-brief-paper px-3 py-1.5 font-dashSans text-xs text-brief-muted">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <circle
                    cx="9"
                    cy="9"
                    r={PROGRESS_RING_RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-brief-rule"
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
                    className="text-brief-accent"
                  />
                </svg>
                {book.progress.percent}%까지 읽음
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <div className="flex items-start justify-between">
            <p className="font-dashSans text-[11px] font-bold tracking-[.08em] text-brief-accent">
              {content.tags.join(' · ')}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-brief-accent opacity-70 transition hover:bg-brief-accent-soft hover:opacity-100"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <h2 className="mt-2.5 font-dashSerif text-[32px] font-bold tracking-[-.02em] text-brief-ink">
            {book.title}
          </h2>

          <p className="mt-1.5 font-dashSerif text-[13px] italic text-brief-muted">{book.author} 지음</p>

          <hr className="my-6 border-brief-rule" />

          <section>
            <h3 className="font-dashSans text-[16.5px] font-bold tracking-[.06em] text-brief-accent">
              도서 소개
            </h3>
            <p className="mt-2.5 font-dashSans text-[14.5px] leading-relaxed text-brief-ink">{content.intro}</p>
          </section>

          <section className="mt-6">
            <h3 className="font-dashSans text-[16.5px] font-bold tracking-[.06em] text-brief-accent">
              배경 지식
            </h3>
            <div className="mt-2.5 space-y-3.5">
              {content.background.map((item, index) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-brief-accent-soft font-dashSans text-xs font-bold text-brief-accent">
                    {index + 1}
                  </span>
                  <p className="font-dashSans text-[14.5px] leading-relaxed text-brief-ink">{item}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
