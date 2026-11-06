import type { QuoteSelectionPopover } from '../../hooks/useQuoteSelection';

const GAP = 12;
const SIDE_MARGIN = 16;
const WIDTH = 160;
const HEIGHT = 44;

// FR-QNA-006
export default function QuoteAskButton({
  popover,
  limitBottom,
  onAsk,
}: {
  popover: QuoteSelectionPopover;
  limitBottom: number;
  onAsk: () => void;
}) {
  const left = Math.min(
    Math.max(SIDE_MARGIN, window.innerWidth / 2 - WIDTH / 2),
    window.innerWidth - SIDE_MARGIN - WIDTH
  );
  const below = popover.bottom + GAP;
  const top = below + HEIGHT <= limitBottom ? below : popover.top - GAP - HEIGHT;
  return (
    <button
      type="button"
      data-quote-ask
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onClick={onAsk}
      style={{ top, left, width: WIDTH, minHeight: HEIGHT }}
      className="fixed z-50 animate-pop-in whitespace-nowrap rounded-2xl border border-brief-accent bg-brief-accent-soft px-3.5 text-[13px] font-bold text-brief-accent shadow-brief-soft-sm"
    >
      아모에게 물어보기
    </button>
  );
}
