/**
 * 서재 인사말 — 대시보드 재설계 시안 (2026-08-23, `.dash-scr .welcome`)
 *
 * 2026-08-22 크리틱 라운드에서 헤더 안의 부제("오늘도 나만의 페이스로…")는 삭제됐다.
 * 이건 그것과 다른 요소다 — 헤더 밖, 본문 상단의 별도 인사 섹션으로 시안이 다시
 * 도입한 것이라 자리와 문구가 다르다.
 */
export default function WelcomeBanner() {
  return (
    <section className="flex items-end justify-between pb-7 pt-[53px]">
      <div>
        <p className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">
          MY READING ROOM
        </p>
        <h1 className="mt-[9px] font-dashSerif text-[clamp(28px,4vw,46px)] font-semibold tracking-[-.07em] text-dash-ink">
          오늘도, 이야기 속으로.
        </h1>
      </div>
    </section>
  );
}
