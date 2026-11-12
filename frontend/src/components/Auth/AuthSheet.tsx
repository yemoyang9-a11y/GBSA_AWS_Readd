import { useRef, type ReactNode } from 'react';
import { useModalLayer } from '../../hooks/useModalLayer';
import { isMobileDevice } from '../../mobile/device';

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="닫기"
      className="-mr-2 flex size-11 items-center justify-center rounded-full text-dash-ink"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

export default function AuthSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  useModalLayer({ active: true, dialogRef, returnFocusRef, onClose });
  const sheet = isMobileDevice(window.screen);

  return (
    <div
      data-testid="auth-sheet-overlay"
      className={`fixed inset-0 z-[70] flex bg-black/40 ${sheet ? 'items-end' : 'items-center justify-center p-6'}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-variant={sheet ? 'sheet' : 'modal'}
        className={`flex max-h-[85dvh] w-full flex-col bg-white font-dashSans text-dash-ink shadow-dash-soft outline-none ${
          sheet ? 'rounded-t-dash-panel px-5 pt-2' : 'max-w-[420px] rounded-dash-panel px-6 pb-6 pt-3'
        }`}
        style={sheet ? { paddingBottom: 'max(20px, var(--safe-bottom))' } : undefined}
      >
        {sheet ? <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 flex-none rounded-full bg-dash-line" /> : null}
        {children}
      </div>
    </div>
  );
}
