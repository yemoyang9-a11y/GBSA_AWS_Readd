/**
 * 싸비 패널 여닫기 버튼.
 *
 * `Reader.tsx`가 화면의 같은 자리(top-bar 아래, 우측 24px)에 **고정 위치**로 그린다 —
 * 열림/닫힘과 무관하게 움직이지 않는다(polish, 2026-08-21: 이전 주석은 상태에 따라
 * 자리가 바뀐다고 잘못 적혀 있었다). 패널 안에만 두면 닫은 뒤 다시 열 수단이 사라지기
 * 때문에 패널 밖, 흐름과 무관한 고정 레이어에 둔다.
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
