import type { ChapterSummary } from '../../types';

/**
 * 읽기 화면 목차 패널 (2026-08-25, 사용자 요청) — S3
 *
 * 목차는 상한 대상이 아니다 — 진도와 무관하게 전량 상시 노출한다 (FR-SPL-001,
 * FR-NAV-001, CLAUDE.md 4장 R3). `GET /books/:bookId/info`가 이미 cutoff 인자
 * 없이 chapters 전체를 내려준다(book-info.service.ts) — 여기서 걸러낼 것이 없다.
 *
 * 브리핑 화면의 목차(BriefingView.tsx)와 달리 여기는 **이동 요소를 만든다** —
 * FR-BRF-004·D12는 브리핑 화면 한정 "표시 전용" 결정이고, 그 결정 자체가
 * "읽기 화면의 목차만 이동 가능하다"고 명시한다(2026-08-23-briefing-redesign.md).
 *
 * 각 장을 누르면 그 장의 start_page로 이동한다 — 서버가 내려준 값 그대로 쓰고
 * 프론트에서 페이지 산술을 하지 않는다(절대 규칙 2번). 페이지 입력창으로 임의
 * 페이지 이동이 이미 가능한 것과 같은 카테고리의 이동이라 새 우회 경로가 아니다.
 */
export default function TocPanel({
  chapters,
  currentPage,
  onSelectChapter,
}: {
  chapters: ChapterSummary[];
  currentPage: number | null;
  onSelectChapter: (startPage: number) => void;
}) {
  return (
    <div className="brief-scroll h-full overflow-y-auto px-5 py-6">
      <h2 className="mb-4 font-dashSerif text-base font-extrabold text-brief-ink">목차</h2>
      {chapters.length === 0 ? (
        <p className="text-xs text-brief-muted">목차를 불러오는 중</p>
      ) : (
        <ul aria-label="목차" className="flex flex-col gap-2">
          {chapters.map((chapter) => {
            const isNow =
              currentPage !== null &&
              currentPage >= chapter.start_page &&
              currentPage <= chapter.end_page;
            return (
              <li key={chapter.chapter_no}>
                <button
                  type="button"
                  aria-current={isNow ? 'true' : undefined}
                  onClick={() => onSelectChapter(chapter.start_page)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isNow ? 'bg-brief-accent-soft' : 'hover:bg-brief-paper'
                  }`}
                >
                  <span
                    className={`flex size-[24px] shrink-0 items-center justify-center rounded-full font-dashMono text-[11px] font-semibold ${
                      isNow ? 'bg-brief-accent text-white' : 'bg-brief-paper text-brief-muted'
                    }`}
                  >
                    {chapter.chapter_no}
                  </span>
                  <span
                    className={`font-dashSans text-[13.5px] ${
                      isNow ? 'font-semibold text-brief-accent' : 'text-brief-ink'
                    }`}
                  >
                    {chapter.title}
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
