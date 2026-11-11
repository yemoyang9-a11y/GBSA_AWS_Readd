// FR-PRG-003
export default function JumpReturnBar({
  origin,
  onReturn,
  onDismiss,
}: {
  origin: number | null;
  onReturn: () => void;
  onDismiss: () => void;
}) {
  if (origin === null) return null;
  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-brief-rule bg-brief-accent-soft px-3 font-dashSans text-[13px] text-brief-ink"
    >
      <span className="truncate">{origin}쪽에서 옮겨 왔어요</span>
      <button
        type="button"
        onClick={onReturn}
        className="min-h-11 shrink-0 rounded-full px-3 font-bold text-brief-accent underline underline-offset-2"
      >
        읽던 곳으로 돌아가기
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="닫기"
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-brief-ink"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
