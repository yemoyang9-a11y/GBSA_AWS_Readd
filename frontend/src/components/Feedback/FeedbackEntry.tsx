import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useModalLayer } from '../../hooks/useModalLayer';
import { submitFeedback } from '../../services/feedbackService';

type Variant = 'modal' | 'sheet';
type Status = 'editing' | 'sending' | 'failed' | 'sent';

const MAX_MESSAGE_LENGTH = 2000;

const PROMPT_CLASS = 'min-w-0 break-keep font-dashSerif text-[22px] font-bold leading-snug text-brief-ink';

const LAYOUT = {
  modal: {
    entry: 'mt-8 flex justify-center',
    opener: 'px-[14px] py-2 text-xs transition-colors hover:bg-dash-ink/5',
    overlay: 'flex items-center justify-center p-6',
    panel: 'w-full max-w-[480px] rounded-dash-panel p-8',
    panelStyle: undefined,
    close: 'size-8',
    input: 'text-[14.5px]',
    submit: 'px-[14px] py-2 text-xs',
  },
  sheet: {
    entry: 'mt-10',
    opener: 'h-12 w-full text-[15px] active:bg-dash-ink/10',
    overlay: '',
    panel:
      'brief-scroll absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-dash-panel px-5 pt-2',
    panelStyle: { paddingBottom: 'max(24px, var(--safe-bottom))' },
    close: '-mr-2 size-11',
    input: 'text-[16px]',
    submit: 'h-12 w-full text-[15px]',
  },
};

function FeedbackDialog({ variant, onClose }: { variant: Variant; onClose: () => void }) {
  const layout = LAYOUT[variant];
  const inputId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('editing');
  const sending = status === 'sending';

  function close() {
    if (!sending) onClose();
  }

  useModalLayer({ active: true, dialogRef, returnFocusRef, onClose: close });

  useEffect(() => {
    if (variant !== 'sheet') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [variant]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending || !message.trim()) return;
    setStatus('sending');
    try {
      await submitFeedback(message);
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div data-testid="feedback-overlay" className={`fixed inset-0 z-50 bg-black/40 ${layout.overlay}`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="의견 남기기"
        tabIndex={-1}
        className={`bg-brief-paper font-dashSans text-brief-ink shadow-brief-soft outline-none ${layout.panel}`}
        style={layout.panelStyle}
      >
        {variant === 'sheet' ? (
          <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-brief-rule" />
        ) : null}
        <div className="flex items-start justify-between gap-3">
          {status === 'sent' ? (
            <p role="status" className={PROMPT_CLASS}>
              소중한 의견 감사합니다.
            </p>
          ) : (
            <label htmlFor={inputId} className={PROMPT_CLASS}>
              여러분의 소중한 의견 남겨주시면 감사하겠습니다.
            </label>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className={`flex shrink-0 items-center justify-center rounded-full text-brief-accent opacity-70 transition hover:bg-brief-accent-soft hover:opacity-100 ${layout.close}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {status === 'sent' ? null : (
          <form onSubmit={handleSubmit}>
            <textarea
              id={inputId}
              value={message}
              disabled={sending}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              className={`mt-4 block h-36 w-full resize-none rounded-dash-panel border border-brief-rule bg-white p-3 leading-relaxed text-brief-ink outline-none focus:border-brief-accent ${layout.input}`}
            />
            {status === 'failed' ? (
              <p role="alert" className="mt-3 break-keep text-[13px] text-brief-muted">
                의견을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.
              </p>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className={`rounded-full bg-brief-accent font-bold text-white disabled:opacity-40 ${layout.submit}`}
              >
                {sending ? '보내는 중' : '제출'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function FeedbackEntry({ variant }: { variant: Variant }) {
  const [open, setOpen] = useState(false);
  const layout = LAYOUT[variant];

  return (
    <div className={layout.entry}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-full border border-dash-ink bg-transparent font-bold text-dash-ink ${layout.opener}`}
      >
        의견 남기기
      </button>
      {open ? <FeedbackDialog variant={variant} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
