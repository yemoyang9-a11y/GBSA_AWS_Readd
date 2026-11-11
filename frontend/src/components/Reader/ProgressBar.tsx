import ssabiFace from '../../assets/images/ssabi-face.png';

/**
 * 진도 바 — 브리핑·대시보드 전용이다.
 * 읽기 화면에는 두지 않는다. 읽기 화면은 페이지 번호만 표시한다 (FR-PRG-004).
 * percent 는 서버가 내려준 값을 그대로 받는다 (FR-BRF-005 🚦).
 *
 * 시안: 트랙 4px(#ebe6e0) / 채움(#1c1b1a), 모서리 2px.
 *
 * ⚠️ 막대 폭은 표시상 0~100으로 자르되 `aria-valuenow` 는 **서버 값 그대로** 둔다.
 *    값을 보정해서 내보내면 그 순간 프론트가 파생값을 만든 게 된다 (절대 규칙 2번).
 *
 * `runner` — 채움 끝에 아모가 뛰어가는 모습(2026-08-26, 사용자 요청, 브리핑에 우선
 * 적용). role="progressbar" 트랙 자체는 overflow-hidden이라 그 안에 두면 위로
 * 튀어나오는 부분이 잘린다 — 트랙 밖, 같은 relative 래퍼 안의 형제로 절대배치한다.
 *
 * 위치·모션 조정 3번째(2026-08-26) — ① 바에 딱 붙임 → "너무 붙었다" → ② 마름모
 * 마커를 바에 고정해 두고 아모만 그 위에서 띄워 뜀 → "아예 바 위에서 이끌어가는
 * 느낌으로, 모션도 더 뛰는 느낌으로" 재요청. 마커를 없애고 아모 발이 바로 바 끝을
 * 딛게 했다 — 마커 없이 아모 자신이 그 지점을 짚는다("이끌고 간다"는 느낌). 모션은
 * amo-run 키프레임에서 세로 통통임에 좌우 스텝(calc(-50% ± px))과 더 큰 회전을
 * 더하고 주기를 줄여(550ms → 420ms) 더 빠르고 발걸음 같게 했다.
 */
export default function ProgressBar({
  percent,
  tone = 'ink',
  size = 'sm',
  runner = false,
}: {
  percent: number;
  tone?: 'ink' | 'accent' | 'dash' | 'brief';
  size?: 'sm' | 'md';
  runner?: boolean;
}) {
  const width = Math.min(Math.max(percent, 0), 100);
  const fillClass =
    tone === 'accent' ? 'bg-accent' : tone === 'dash' || tone === 'brief' ? 'bg-[#555]' : 'bg-ink';
  const trackClass = tone === 'dash' ? 'bg-dash-line' : tone === 'brief' ? 'bg-brief-line' : 'bg-line';
  const heightClass = size === 'md' ? 'h-1.5' : 'h-1';

  return (
    <div className={runner ? 'relative' : undefined}>
      {runner ? (
        // 아모가 바로 그 지점을 딛고 뛴다 — 별도 마커 없이 아모 자신이 위치를
        // 짚는다. bottom-full(바로 위 끝) → bottom-0(트랙과 같은 높이에서 시작,
        // "바랑 겹치게") → bottom-[-6px](2026-08-26, "좀 더 내려줘" 재요청 — 트랙
        // 바닥보다도 더 아래로 내려 겹치는 부분을 늘렸다)로 세 번째 조정.
        <img
          src={ssabiFace}
          alt=""
          aria-hidden="true"
          data-testid="progress-runner"
          className="absolute bottom-[-11px] h-7 w-auto origin-bottom animate-amo-run object-contain"
          style={{ left: `${width}%` }}
        />
      ) : null}
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
    </div>
  );
}
