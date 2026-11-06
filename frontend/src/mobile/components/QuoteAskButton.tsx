import type { QuoteSelectionPopover } from '../../hooks/useQuoteSelection';

const GAP = 12;
const SIDE_MARGIN = 16;
const WIDTH = 160;

// FR-QNA-006
export default function QuoteAskButton({ popover, onAsk }: { popover: QuoteSelectionPopover; onAsk: () => void }) {
  const left = Math.min(
    Math.max(SIDE_MARGIN, window.innerWidth / 2 - WIDTH / 2),
    window.innerWidth - SIDE_MARGIN - WIDTH
  );
  return (
    <button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={onAsk}
      style={{ top: popover.bottom + GAP, left, width: WIDTH }}
      className="fixed z-50 min-h-11 rounded-full bg-brief-ink px-4 font-dashSans text-[14px] font-semibold text-white shadow-brief-soft-sm"
    >
      챗봇에 물어보기
    </button>
  );
}
