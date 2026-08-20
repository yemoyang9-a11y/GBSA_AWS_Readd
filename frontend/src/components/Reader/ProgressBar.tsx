/**
 * 진도 바 — 브리핑·대시보드 전용이다.
 * 읽기 화면에는 두지 않는다. 읽기 화면은 페이지 번호만 표시한다 (FR-PRG-004).
 * percent 는 서버가 내려준 값을 그대로 받는다 (FR-BRF-005 🚦).
 */
export default function ProgressBar({ percent }: { percent: number }) {
  return <div role="progressbar" aria-valuenow={percent} />;
}
