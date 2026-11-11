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
    <ol role="list" aria-label="목차" className="m-0 list-none p-0">
      {chapters.map((chapter) => {
        const current = position !== null && chapter.chapter_no === position.current_chapter_no;
        const read = !current && position !== null && position.read_chapter_nos.includes(chapter.chapter_no);
        return (
          <li key={chapter.chapter_no} className="border-b border-dash-line">
            <button
              type="button"
              disabled={disabled}
              aria-current={current ? 'true' : undefined}
              onClick={() => onSelect(chapter)}
              className={`flex min-h-[52px] w-full items-center gap-3 px-2 text-left text-sm text-dash-ink transition-colors hover:bg-dash-ink/[0.04] disabled:opacity-40 disabled:hover:bg-transparent ${
                current ? 'bg-brief-accent-soft font-bold hover:bg-brief-accent-soft' : ''
              }`}
            >
              <span
                className={`grid shrink-0 place-items-center font-dashMono text-xs ${
                  current ? 'size-5 rounded-full bg-brief-accent text-[11px] text-white' : 'w-5 text-dash-muted'
                }`}
              >
                {chapter.chapter_no}
              </span>
              <span className="min-w-0 break-keep">{chapter.title}</span>
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
                className={`ml-auto shrink-0 pl-2 font-dashMono text-[11px] ${current ? 'text-brief-accent' : 'text-dash-muted'}`}
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
