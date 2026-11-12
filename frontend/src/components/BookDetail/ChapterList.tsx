import type { PositionResponse } from '../../services/positionService';
import type { ChapterSummary } from '../../types';

// FR-NAV-001 FR-SPL-002
export default function ChapterList({
  chapters,
  position,
  disabled = false,
  onSelect,
}: {
  chapters: ChapterSummary[];
  position: PositionResponse | null;
  disabled?: boolean;
  onSelect: (chapter: ChapterSummary) => void;
}) {
  return (
    <ol role="list" aria-label="목차" className="m-0 flex list-none flex-col gap-2 p-0 pt-3">
      {chapters.map((chapter) => {
        const current = position !== null && chapter.chapter_no === position.current_chapter_no;
        const read = !current && position !== null && position.read_chapter_nos.includes(chapter.chapter_no);
        return (
          <li key={chapter.chapter_no}>
            <button
              type="button"
              disabled={disabled}
              aria-current={current ? 'true' : undefined}
              onClick={() => onSelect(chapter)}
              className={`group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brief-accent/40 focus-visible:ring-offset-2 disabled:opacity-40 ${
                current
                  ? 'bg-brief-accent-soft'
                  : 'enabled:hover:bg-brief-accent/10 enabled:hover:shadow-brief-soft-sm motion-safe:enabled:hover:translate-x-0.5'
              }`}
            >
              <span
                className={`flex size-[24px] shrink-0 items-center justify-center rounded-full font-dashMono text-[11px] font-semibold ${
                  current
                    ? 'bg-brief-accent text-white'
                    : 'bg-brief-paper text-brief-muted transition-colors group-enabled:group-hover:bg-white group-enabled:group-hover:text-brief-accent'
                }`}
              >
                {chapter.chapter_no}
              </span>
              <span
                className={`min-w-0 break-keep font-dashSans text-[13.5px] ${
                  current
                    ? 'font-semibold text-brief-accent'
                    : 'text-brief-ink transition-colors group-enabled:group-hover:text-brief-accent'
                }`}
              >
                {chapter.title}
              </span>
              {read && (
                <>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0 text-brief-accent"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  <span className="sr-only">읽음</span>
                </>
              )}
              <span
                className={`ml-auto shrink-0 pl-2 font-dashMono text-[11px] ${current ? 'text-brief-accent' : 'text-brief-muted'}`}
              >
                {current && (
                  <>
                    <span>읽는 중</span>
                    {' · '}
                  </>
                )}
                {chapter.start_page}p
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
