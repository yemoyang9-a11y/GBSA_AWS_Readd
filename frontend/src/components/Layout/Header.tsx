/**
 * nav-bar — 시안 1:102 (높이 80px, 하단 line 보더)
 *
 * 좌측 부제 + 우측 도서 검색·RE:ADD 로고.
 * "도서 검색"은 대응 엔드포인트가 없어 자리만 두고 비활성으로 둔다 — 없는 API를
 * 지어내지 않는다 (CLAUDE.md 6장, 스펙 §7 #3).
 *
 * ⚠️ 시안의 "수진님의 서재" 제목 줄은 만들지 않는다. 이 앱에는 계정 개념이 없고
 *    디바이스 식별자만 있어(team-sync §4.8) 사람 이름을 띄울 근거가 없다.
 */
export default function Header({ subtitle }: { subtitle: string }) {
  return (
    <header className="flex h-navbar items-center justify-between border-b border-line px-7">
      <div className="flex flex-col justify-center">
        <p className="text-[13px] text-muted">{subtitle}</p>
      </div>

      <div className="flex items-center gap-7">
        <button type="button" disabled className="text-sm text-ink disabled:opacity-40">
          도서 검색
        </button>
        <span className="font-serif text-xl font-bold tracking-widest text-ink">RE:ADD</span>
      </div>
    </header>
  );
}
