// FR-NAV-001 FR-SVB-003
export default function EdgeHandle({
  side,
  label,
  controls,
  open,
  onToggle,
  hidden = false,
}: {
  side: 'left' | 'right';
  label: string;
  controls: string;
  open: boolean;
  onToggle: () => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  const left = side === 'left';
  return (
    <button
      type="button"
      aria-label={open ? `${label} 닫기` : `${label} 열기`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={`fixed top-[58%] z-50 flex h-16 w-11 -translate-y-1/2 items-center ${
        left ? 'left-0 justify-start' : 'right-0 justify-end'
      }`}
    >
      <span
        data-testid="edge-handle-tab"
        aria-hidden="true"
        className={`flex h-12 w-3.5 items-center justify-center border bg-white transition-shadow hover:shadow-brief-soft-sm ${
          left ? 'rounded-r-full border-l-0' : 'rounded-l-full border-r-0'
        } ${open ? 'border-brief-ink' : 'border-brief-rule'}`}
      >
        <span className="h-5 w-[2px] rounded-full bg-brief-ink" />
      </span>
    </button>
  );
}
