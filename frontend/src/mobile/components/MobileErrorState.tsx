// FR-SPL-005 🚦 NFR-USE
export default function MobileErrorState({
  message,
  onRetry,
  tone = 'brief',
}: {
  message: string;
  onRetry: () => void;
  tone?: 'brief' | 'dash';
}) {
  return (
    <div className="flex h-full min-h-[50dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p role="alert" className={`break-keep text-[14px] ${tone === 'dash' ? 'text-dash-muted' : 'text-brief-muted'}`}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-lg bg-ink px-6 text-[15px] font-bold text-white"
      >
        다시 시도
      </button>
    </div>
  );
}
