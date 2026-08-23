/**
 * 진도 바 — 브리핑·대시보드 전용이다.
 * 읽기 화면에는 두지 않는다. 읽기 화면은 페이지 번호만 표시한다 (FR-PRG-004).
 * percent 는 서버가 내려준 값을 그대로 받는다 (FR-BRF-005 🚦).
 *
 * 시안: 트랙 4px(#ebe6e0) / 채움(#1c1b1a), 모서리 2px.
 * 브리핑 화면은 accent(#3b3db2) 채움을 쓴다 (tone="accent"). 대시보드 도서 카드는
 * ink 채움을 유지한다 (tone 기본값).
 *
 * ⚠️ 막대 폭은 표시상 0~100으로 자르되 `aria-valuenow` 는 **서버 값 그대로** 둔다.
 *    값을 보정해서 내보내면 그 순간 프론트가 파생값을 만든 게 된다 (절대 규칙 2번).
 */
export default function ProgressBar({
  percent,
  tone = 'ink',
}: {
  percent: number;
  tone?: 'ink' | 'accent' | 'dash';
}) {
  const width = Math.min(Math.max(percent, 0), 100);
  const fillClass = tone === 'accent' ? 'bg-accent' : tone === 'dash' ? 'bg-dash-ink' : 'bg-ink';
  const trackClass = tone === 'dash' ? 'bg-dash-line' : 'bg-line';

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1 w-full overflow-hidden rounded-sm ${trackClass}`}
    >
      <div
        data-testid="progress-fill"
        className={`h-full ${fillClass}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
