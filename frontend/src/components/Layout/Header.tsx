/**
 * nav-bar — 대시보드 재설계 시안 (2026-08-23, `.dash-scr header`)
 *
 * 좌측 RE:ADD 워드마크(DM Mono) + 우측 도서 검색.
 * 하단 보더는 화면을 가로지르되 안쪽 내용은 `max-w-page` 컨테이너에 정렬한다 —
 * 대시보드 본문과 좌우 끝을 맞추기 위해서다.
 *
 * "도서 검색"은 대응 엔드포인트가 없어 자리만 두고 비활성으로 둔다 — 시안은 활성으로
 * 그렸지만 없는 API 를 지어내지 않는다 (CLAUDE.md 6장, 스펙 §7 #3). 재설계에서도 유지.
 *
 * 계정 개념이 없으므로 "OOO님의 서재" 같은 인칭 제목은 두지 않는다 (team-sync §4.8).
 */
export default function Header() {
  return (
    <header className="h-14 border-b border-dash-line">
      <div className="mx-auto flex h-full w-full max-w-page items-center justify-between px-7">
        <span className="font-dashMono text-[22px] font-medium tracking-[-1px] text-dash-ink">
          RE:<b className="font-medium">ADD</b>
        </span>

        <button
          type="button"
          disabled
          className="flex items-center gap-2 font-dashSans text-[19px] text-dash-muted disabled:opacity-40"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          도서 검색
        </button>
      </div>
    </header>
  );
}
