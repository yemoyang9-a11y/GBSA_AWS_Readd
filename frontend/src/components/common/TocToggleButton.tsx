/**
 * 목차 패널 여닫기 버튼 (2026-08-25, 사용자 요청 — 읽기 화면 목차)
 *
 * SsabiToggleButton과 같은 자리 규칙을 왼쪽에 대칭으로 적용한다 — Reader.tsx가
 * top-bar 좌측에 **고정 위치**로 그린다. 열림/닫힘과 무관하게 움직이지 않아야
 * 패널을 닫은 뒤에도 다시 열 수단이 남는다.
 */
export default function TocToggleButton({
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
      aria-controls="toc-panel"
      aria-label={open ? '목차 닫기' : '목차 열기'}
      className={`flex size-[38px] shrink-0 items-center justify-center rounded-full border bg-white text-brief-ink transition-shadow hover:shadow-brief-soft-sm ${
        open ? 'border-brief-ink' : 'border-brief-rule'
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-[17px]" fill="none" aria-hidden="true">
        <path
          d="M4 6h16M4 12h16M4 18h10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
