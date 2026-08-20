/**
 * 싸비 패널 여닫기 버튼.
 *
 * 컨트롤은 하나이고 **자리만 상태에 따라 옮긴다** — 열려 있으면 패널 헤더 우측
 * ("싸비의 가이드북" 오른쪽), 닫혀 있으면 읽기 화면 top-bar 우측이다.
 * 패널 안에만 두면 닫은 뒤 다시 열 수단이 사라지기 때문이다.
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
      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink text-surface transition-opacity hover:opacity-80"
    >
      {/* 우측 영역이 채워진 패널 모양 */}
      <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
        <rect
          x="1.2"
          y="2.7"
          width="13.6"
          height="10.6"
          rx="2.4"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path d="M9.8 2.7v10.6" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M9.8 2.7h2.6a2.4 2.4 0 0 1 2.4 2.4v6.2a2.4 2.4 0 0 1-2.4 2.4H9.8V2.7Z"
          fill="currentColor"
          fillOpacity="0.35"
        />
      </svg>
    </button>
  );
}
