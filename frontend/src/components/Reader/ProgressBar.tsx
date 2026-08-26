import ssabiFace from '../../assets/images/ssabi-face.png';

/**
 * 진도 바 — 브리핑·대시보드 전용이다.
 * 읽기 화면에는 두지 않는다. 읽기 화면은 페이지 번호만 표시한다 (FR-PRG-004).
 * percent 는 서버가 내려준 값을 그대로 받는다 (FR-BRF-005 🚦).
 *
 * 시안: 트랙 4px(#ebe6e0) / 채움(#1c1b1a), 모서리 2px.
 *
 * 대시보드(tone="dash")와 브리핑(tone="brief")의 채움색·크기가 서로 달라 통일했다
 * (2026-08-25, 사용자 결정). 크기는 브리핑 쪽 size="md"(6px)로 맞춘다 — 대시보드
 * 호출부(ContinueReadingHero)에 size="md"를 명시로 추가했다. 트랙(빈 배경) 색은
 * 화면별 톤(dash-line/brief-line)을 그대로 유지한다.
 *
 * 채움색은 이후 갈라졌다 — 대시보드(dash)는 `progress` 토큰(남색 #35536b, 시안 5종
 * 비교 후 선택)을 그대로 쓰지만, 브리핑(brief)만 회색(#555)으로 바꿨다(2026-08-26,
 * 사용자 요청 — 같은 화면의 날짜 라벨·쪽수·퍼센트 숫자를 회색으로 맞춘 김에 바도 맞춤).
 *
 * ⚠️ 막대 폭은 표시상 0~100으로 자르되 `aria-valuenow` 는 **서버 값 그대로** 둔다.
 *    값을 보정해서 내보내면 그 순간 프론트가 파생값을 만든 게 된다 (절대 규칙 2번).
 *
 * `runner` — 채움 끝에 아모가 뛰어가는 모습(2026-08-26, 사용자 요청, 브리핑에 우선
 * 적용). role="progressbar" 트랙 자체는 overflow-hidden이라 그 안에 두면 위로
 * 튀어나오는 부분이 잘린다 — 트랙 밖, 같은 relative 래퍼 안의 형제로 절대배치한다.
 *
 * 아모를 바에 딱 붙이니(이전 버전) "너무 붙었다"는 재요청 — 대신 말풍선 꼬리 같은
 * 작은 마름모 마커를 바 위 그 지점에 고정해 두고, 아모는 그 마커 위에서 살짝 띄워
 * 통통 튄다. 마커는 애니메이션 없이 항상 정확한 위치를 짚고, 아모만 움직여서
 * "그 지점을 따라가며 뛰는" 느낌을 낸다 — 위치와 애니메이션을 분리했다.
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
    tone === 'accent'
      ? 'bg-accent'
      : tone === 'dash'
        ? 'bg-progress'
        : tone === 'brief'
          ? 'bg-[#555]'
          : 'bg-ink';
  const trackClass = tone === 'dash' ? 'bg-dash-line' : tone === 'brief' ? 'bg-brief-line' : 'bg-line';
  const heightClass = size === 'md' ? 'h-1.5' : 'h-1';

  return (
    <div className={runner ? 'relative' : undefined}>
      {runner ? (
        <>
          {/* 말풍선 꼬리 같은 마커 — 애니메이션 없이 항상 그 지점 바로 위, 바에 딱 붙어
              있는다. 크기는 pop-in 등과 통일한 8px(size-2). */}
          <div
            aria-hidden="true"
            className="absolute bottom-full size-2 -translate-x-1/2 translate-y-1 rotate-45 rounded-[2px] border border-brief-rule bg-white"
            style={{ left: `${width}%` }}
          />
          {/* 아모 — 마커 위에서 통통 뛴다. bottom:100%는 가장 가까운 relative 조상의
              패딩 박스 위쪽 끝 기준이라, 래퍼에 padding을 주면 그만큼 바에서 멀어진다
              (이전 버전에서 겪은 문제) — 래퍼는 패딩 없이 relative만 준다. */}
          <img
            src={ssabiFace}
            alt=""
            aria-hidden="true"
            data-testid="progress-runner"
            className="absolute bottom-full h-7 w-auto origin-bottom animate-amo-run object-contain"
            style={{ left: `${width}%` }}
          />
        </>
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
