/**
 * nav-bar — 시안 1:102 (높이 80px, 하단 line 보더)
 *
 * 좌측 RE:ADD 워드마크 + 우측 도서 검색.
 * 하단 보더는 화면을 가로지르되 안쪽 내용은 `max-w-page` 컨테이너에 정렬한다 —
 * 대시보드 본문과 좌우 끝을 맞추기 위해서다.
 *
 * "도서 검색"은 대응 엔드포인트가 없어 자리만 두고 비활성으로 둔다 — 없는 API를
 * 지어내지 않는다 (CLAUDE.md 6장, 스펙 §7 #3).
 *
 * 계정 개념이 없으므로 "OOO님의 서재" 같은 인칭 제목은 두지 않는다 (team-sync §4.8).
 */
export default function Header() {
  return (
    <header className="h-navbar border-b border-line">
      <div className="mx-auto flex h-full w-full max-w-page items-center justify-between px-7">
        <span className="font-serif text-xl font-bold tracking-widest text-ink">RE:ADD</span>

        <button type="button" disabled className="text-[13px] text-ink disabled:opacity-40">
          도서 검색
        </button>
      </div>
    </header>
  );
}
