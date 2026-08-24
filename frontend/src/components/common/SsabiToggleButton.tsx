/**
 * 싸비 패널 여닫기 버튼 — 재설계 2026-08-23 (`.reader-scr .tb-toggle`)
 *
 * `Reader.tsx`가 화면의 같은 자리(top-bar 우측)에 **고정 위치**로 그린다 — 열림/닫힘과
 * 무관하게 움직이지 않는다. 패널 안에만 두면 닫은 뒤 다시 열 수단이 사라지기 때문에
 * 패널 밖, 흐름과 무관한 고정 레이어에 둔다.
 *
 * 시안은 원형 아웃라인 버튼이다(채움 없음) — 이전 버전은 사각형+채움이었다. 열렸을 때는
 * 테두리만 ink로 강조한다.
 */
export default function SsabiToggleButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="ssabi-panel"
      aria-label={open ? '싸비 닫기' : '싸비 열기'}
      className={`flex size-[38px] shrink-0 items-center justify-center rounded-full border bg-white text-brief-ink transition-shadow hover:shadow-brief-soft-sm ${
        open ? 'border-brief-ink' : 'border-brief-rule'
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-[17px]" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 4v16" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  );
}
