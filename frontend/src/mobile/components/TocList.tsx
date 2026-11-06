import { useEffect, useRef } from 'react';
import type { ChapterSummary } from '../../types';

// FR-NAV-001
export default function TocList({
  chapters,
  currentPage,
  onSelect,
}: {
  chapters: ChapterSummary[];
  currentPage: number | null;
  onSelect: (startPage: number) => void;
}) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const currentChapterNo = chapters.find(
    (chapter) => currentPage !== null && currentPage >= chapter.start_page && currentPage <= chapter.end_page
  )?.chapter_no;

  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [currentChapterNo]);

  return (
    <div
      id="toc-panel"
      data-testid="toc-list"
      className="brief-scroll fixed left-11 top-[58%] z-50 max-h-[50dvh] w-max min-w-[140px] max-w-[45vw] -translate-y-1/2 overflow-y-auto rounded-2xl border border-brief-rule bg-brief-page p-1.5"
    >
      <h2 className="px-2.5 pb-2 pt-2 font-dashSerif text-base font-extrabold text-brief-ink">목차</h2>
      {chapters.length === 0 ? (
        <p className="px-2.5 pb-2 text-xs text-brief-muted">목차를 불러오는 중</p>
      ) : (
        <ul role="list" aria-label="목차">
          {chapters.map((chapter) => {
            const isNow = chapter.chapter_no === currentChapterNo;
            return (
              <li key={chapter.chapter_no}>
                <button
                  ref={isNow ? currentRef : undefined}
                  type="button"
                  aria-current={isNow ? 'true' : undefined}
                  onClick={() => onSelect(chapter.start_page)}
                  className={`group flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brief-accent/40 focus-visible:ring-offset-2 ${
                    isNow ? 'bg-brief-accent-soft' : 'hover:bg-brief-accent/10 hover:shadow-brief-soft-sm hover:translate-x-0.5'
                  }`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full font-dashMono text-[11px] font-semibold ${
                      isNow
                        ? 'bg-brief-accent text-white'
                        : 'bg-brief-paper text-brief-muted transition-colors group-hover:bg-white group-hover:text-brief-accent'
                    }`}
                  >
                    {chapter.chapter_no}
                  </span>
                  <span
                    className={`line-clamp-2 flex-1 font-dashSans text-[13.5px] leading-snug ${
                      isNow ? 'font-semibold text-brief-accent' : 'text-brief-ink transition-colors group-hover:text-brief-accent'
                    }`}
                  >
                    {chapter.title}
                  </span>
                  <span className={`shrink-0 font-dashMono text-[11px] ${isNow ? 'text-brief-accent' : 'text-brief-muted'}`}>
                    {chapter.start_page}p
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
