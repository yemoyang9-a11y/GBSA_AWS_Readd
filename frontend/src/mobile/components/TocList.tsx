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
    <ul
      data-testid="toc-list"
      role="list"
      aria-label="목차"
      className="brief-scroll fixed left-11 top-[58%] z-50 max-h-[50dvh] w-max min-w-[140px] max-w-[45vw] -translate-y-1/2 overflow-y-auto rounded-2xl border border-brief-rule bg-brief-paper p-1.5 shadow-brief-soft-sm"
    >
      {chapters.map((chapter) => {
        const isNow = chapter.chapter_no === currentChapterNo;
        return (
          <li key={chapter.chapter_no}>
            <button
              ref={isNow ? currentRef : undefined}
              type="button"
              aria-current={isNow ? 'true' : undefined}
              onClick={() => onSelect(chapter.start_page)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left ${
                isNow ? 'bg-brief-accent-soft' : ''
              }`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full font-dashMono text-[11px] font-semibold ${
                  isNow ? 'bg-brief-accent text-white' : 'bg-brief-line text-brief-muted'
                }`}
              >
                {chapter.chapter_no}
              </span>
              <span
                className={`line-clamp-2 flex-1 font-dashSans text-[13.5px] leading-snug ${
                  isNow ? 'font-semibold text-brief-accent' : 'text-brief-ink'
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
  );
}
