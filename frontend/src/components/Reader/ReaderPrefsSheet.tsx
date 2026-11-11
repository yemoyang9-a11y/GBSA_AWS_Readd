import { useRef } from 'react';
import type { RefObject } from 'react';
import { useModalLayer } from '../../hooks/useModalLayer';
import type { useReaderPrefs } from '../../hooks/useReaderPrefs';
import ReaderPrefsControls from './ReaderPrefsControls';

// FR-PRG-001
export default function ReaderPrefsSheet({
  variant,
  onClose,
  returnFocusRef,
  prefsApi,
}: {
  variant: 'sheet' | 'popover';
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  prefsApi: ReturnType<typeof useReaderPrefs>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalLayer({ active: true, dialogRef, returnFocusRef, onClose });

  const sheet = variant === 'sheet';

  return (
    <div
      data-testid="reader-prefs-overlay"
      className={`fixed inset-0 z-[60] ${sheet ? 'bg-black/20' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="보기 설정"
        tabIndex={-1}
        className={`bg-brief-paper text-brief-ink shadow-brief-soft outline-none ${
          sheet
            ? 'absolute inset-x-0 bottom-0 rounded-t-brief-panel px-5 pt-2'
            : 'absolute right-6 top-[68px] w-[340px] rounded-brief-panel border border-brief-rule px-5 pb-2 pt-3'
        }`}
        style={sheet ? { paddingBottom: 'max(16px, var(--safe-bottom))' } : undefined}
      >
        {sheet ? <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-brief-rule" /> : null}
        <div className="flex items-center justify-between">
          <h2 className="font-dashSerif text-base font-extrabold">보기 설정</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 flex size-11 items-center justify-center rounded-full text-brief-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <ReaderPrefsControls {...prefsApi} tone="brief" />
      </div>
    </div>
  );
}
