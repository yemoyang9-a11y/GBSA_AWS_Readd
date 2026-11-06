// FR-NAV-001 FR-SVB-003
export default function EdgeHandle({
  side,
  label,
  open,
  onToggle,
  hidden = false,
}: {
  side: 'left' | 'right';
  label: string;
  open: boolean;
  onToggle: () => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  const left = side === 'left';
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={onToggle}
      className={`fixed top-[58%] z-50 flex h-16 w-11 -translate-y-1/2 items-center ${
        left ? 'left-0 justify-start' : 'right-0 justify-end'
      }`}
    >
      <span
        data-testid="edge-handle-tab"
        aria-hidden="true"
        className={`flex h-12 w-3.5 items-center justify-center border border-brief-rule shadow-brief-soft-sm transition-colors ${
          left ? 'rounded-r-full border-l-0' : 'rounded-l-full border-r-0'
        } ${open ? 'bg-brief-ink opacity-90' : 'bg-brief-paper opacity-70'}`}
      >
        <span className={`h-5 w-[2px] rounded-full ${open ? 'bg-brief-paper' : 'bg-brief-muted'}`} />
      </span>
    </button>
  );
}
