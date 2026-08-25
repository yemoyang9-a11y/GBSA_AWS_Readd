/**
 * 진도 바 — 브리핑·대시보드 전용이다.
 * 읽기 화면에는 두지 않는다. 읽기 화면은 페이지 번호만 표시한다 (FR-PRG-004).
 * percent 는 서버가 내려준 값을 그대로 받는다 (FR-BRF-005 🚦).
 *
 * 시안: 트랙 4px(#ebe6e0) / 채움(#1c1b1a), 모서리 2px.
 *
 * 대시보드(tone="dash")와 브리핑(tone="brief")의 채움색·크기가 서로 달라 통일했다
 * (2026-08-25, 사용자 결정). 채움은 둘 다 `progress` 토큰(남색 #35536b, 시안 5종
 * 비교 후 선택)을 쓰고, 크기는 브리핑 쪽 size="md"(6px)로 맞춘다 — 대시보드 호출부
 * (ContinueReadingHero)에 size="md"를 명시로 추가했다. 트랙(빈 배경) 색은 화면별
 * 톤(dash-line/brief-line)을 그대로 유지한다 — 통일 대상은 채움색·크기뿐이었다.
 *
 * ⚠️ 막대 폭은 표시상 0~100으로 자르되 `aria-valuenow` 는 **서버 값 그대로** 둔다.
 *    값을 보정해서 내보내면 그 순간 프론트가 파생값을 만든 게 된다 (절대 규칙 2번).
 */
export default function ProgressBar({
  percent,
  tone = 'ink',
  size = 'sm',
}: {
  percent: number;
  tone?: 'ink' | 'accent' | 'dash' | 'brief';
  size?: 'sm' | 'md';
}) {
  const width = Math.min(Math.max(percent, 0), 100);
  const fillClass =
    tone === 'accent'
      ? 'bg-accent'
      : tone === 'dash' || tone === 'brief'
        ? 'bg-progress'
        : 'bg-ink';
  const trackClass = tone === 'dash' ? 'bg-dash-line' : tone === 'brief' ? 'bg-brief-line' : 'bg-line';
  const heightClass = size === 'md' ? 'h-1.5' : 'h-1';

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`${heightClass} w-full overflow-hidden rounded-full ${trackClass}`}
    >
      <div
        data-testid="progress-fill"
        className={`h-full ${fillClass}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
