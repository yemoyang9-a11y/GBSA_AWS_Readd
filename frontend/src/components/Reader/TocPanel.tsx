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
 *
 * "목차" 제목에 pl-20(2026-08-25, 사용자 제보 — 아이콘과 글자가 겹침)을 준다 —
 * TocToggleButton은 Reader.tsx가 이 패널과 무관하게 `absolute left-6 top-20`
 * 고정 위치로 그리는데, 그 자리가 패널을 열었을 때 이 제목이 시작되는 자리와
 * 겹친다. SsabiPanel 헤더의 pr-20(반대쪽, 같은 이유)과 같은 처방이다.
 * 그 pl-20은 스크롤 최상단에서만 통한다 — 스크롤한 뒤 목록이 버튼 뒤로 지나가는
 * 문제는 제목 줄을 sticky 로 고정해 따로 막는다(2026-08-26, 아래 주석).
 *
 * 각 장 옆 "{start_page}p" 표시(2026-08-25, 사용자 요청) — `chapter.start_page`를
 * 그대로 문자열에 꽂는 것뿐, 계산 없음. 목차 자체가 상한 대상이 아니므로(위 설명)
 * 시작 페이지 노출도 같은 이유로 안전하다.
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
    <div className="brief-scroll h-full overflow-y-auto">
      {/*
        제목 줄을 스크롤 영역 위쪽에 고정한다 (2026-08-26, 사용자 제보 — "목차를 열고
        화면을 내리면 토글 버튼이 장 번호를 가린다").

        TocToggleButton은 Reader가 이 패널과 무관하게 `absolute left-6 top-20`으로 그린다.
        화면 기준 고정이라 패널이 스크롤돼도 제자리에 남는데, 그 자리가 스크롤 영역
        위쪽과 겹친다 — 목록이 올라오면 버튼 뒤로 지나가며 장 번호가 가려졌다.
        pl-20(아래)은 스크롤 최상단에서 제목과 버튼이 겹치는 것만 막아 줄 뿐이라
        스크롤한 뒤에는 소용이 없었다.

        불투명 배경을 가진 이 제목 줄이 그 구간을 덮어, 목록이 버튼이 아니라 제목 줄
        뒤로 사라지게 한다. 높이(pt-6 + 본문 1줄 + pb-4 = 64px)는 버튼이 차지하는
        구간(스크롤 영역 기준 16~54px)을 덮는 값이다.

        z-index는 목록 위·버튼 아래여야 한다 — 버튼과 같은 z-10을 주면 DOM 순서상
        이 패널이 뒤에 있어 제목 줄이 버튼을 덮어 버린다(버튼을 못 누르게 된다).
      */}
      <h2 className="sticky top-0 z-[5] bg-brief-page pb-4 pl-20 pr-5 pt-6 font-dashSerif text-base font-extrabold text-brief-ink">
        목차
      </h2>
      <div className="px-5 pb-6">
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
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brief-accent/40 focus-visible:ring-offset-2 ${
                      isNow
                        ? 'bg-brief-accent-soft'
                        : 'hover:bg-brief-accent/10 hover:shadow-brief-soft-sm hover:translate-x-0.5'
                    }`}
                  >
                    <span
                      className={`flex size-[24px] shrink-0 items-center justify-center rounded-full font-dashMono text-[11px] font-semibold ${
                        isNow
                          ? 'bg-brief-accent text-white'
                          : 'bg-brief-paper text-brief-muted transition-colors group-hover:bg-white group-hover:text-brief-accent'
                      }`}
                    >
                      {chapter.chapter_no}
                    </span>
                    <span
                      className={`flex-1 font-dashSans text-[13.5px] ${
                        isNow
                          ? 'font-semibold text-brief-accent'
                          : 'text-brief-ink transition-colors group-hover:text-brief-accent'
                      }`}
                    >
                      {chapter.title}
                    </span>
                    <span
                      className={`shrink-0 font-dashMono text-[11px] ${
                        isNow ? 'text-brief-accent' : 'text-brief-muted'
                      }`}
                    >
                      {chapter.start_page}p
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
