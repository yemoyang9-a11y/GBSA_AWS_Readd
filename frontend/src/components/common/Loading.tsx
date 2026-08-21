/**
 * 로딩 표시 — 전체 화면(진입 판정·본문·서재 목록)과 싸비 패널 내부(관계도 조회) 양쪽에서 쓴다.
 * `fullScreen=false`는 패널 안(서페이스 배경, 420px 폭)에 맞춘 여백만 준다 — 캔버스 배경을
 * 깔지 않는다. 회전 표시는 이 시스템에서 유일하게 허용한 모션이고, 색은 항상 중립(line/ink)만
 * 쓴다 — 액센트 두 색(인디고/테라코타)은 각자의 영역 밖에서 쓰지 않는다는 규칙이 로딩에도 적용된다.
 */
export default function Loading({
  message = '불러오는 중',
  fullScreen = true,
}: {
  message?: string;
  fullScreen?: boolean;
}) {
  return (
    <div
      role="status"
      className={
        fullScreen
          ? 'flex h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center'
          : 'flex flex-col items-center justify-center gap-3 py-16 text-center'
      }
    >
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-line border-t-ink"
      />
      <span className="font-sans text-[13px] text-muted">{message}</span>
    </div>
  );
}
