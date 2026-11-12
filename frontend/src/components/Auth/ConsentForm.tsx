import { useId, useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import AuthSheet, { CloseButton } from './AuthSheet';
import termsBody from '../../content/legal/terms.md?raw';
import privacyBody from '../../content/legal/privacy.md?raw';
import ageBody from '../../content/legal/age.md?raw';

const ITEMS = [
  { key: 'terms', label: '[필수] 이용약관', title: '이용약관', body: termsBody },
  { key: 'privacy', label: '[필수] 개인정보 수집·이용', title: '개인정보 수집·이용', body: privacyBody },
  { key: 'age', label: '[필수] 만 14세 이상입니다', title: '만 14세 이상 확인', body: ageBody },
] as const;

type ItemKey = (typeof ITEMS)[number]['key'];

const OUTLINE_BUTTON =
  'inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-dash-ink bg-white px-4 text-[15px] font-bold text-dash-ink disabled:opacity-40';
const FILLED_BUTTON =
  'inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-dash-ink bg-dash-ink px-4 text-[15px] font-bold text-white disabled:opacity-40';

function LegalDocDialog({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <AuthSheet label={title} onClose={onClose}>
      <div className="flex flex-none items-center justify-between">
        <h2 className="font-dashSerif text-[17px] font-bold">{title}</h2>
        <CloseButton onClick={onClose} />
      </div>
      <div className="min-h-0 overflow-y-auto break-keep pb-2 text-[14px] leading-relaxed [&_blockquote]:mb-4 [&_blockquote]:rounded-dash-card [&_blockquote]:bg-dash-paper [&_blockquote]:px-3 [&_blockquote]:py-2 [&_blockquote]:text-[13px] [&_h2]:sr-only [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:mb-2">
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>
    </AuthSheet>
  );
}

export default function ConsentForm({
  onAgree,
  onCancel,
}: {
  onAgree: () => Promise<void>;
  onCancel: () => void;
}) {
  const idPrefix = useId();
  const [checked, setChecked] = useState<Record<ItemKey, boolean>>({ terms: false, privacy: false, age: false });
  const [reading, setReading] = useState<ItemKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const allChecked = ITEMS.every((item) => checked[item.key]);
  const readingItem = ITEMS.find((item) => item.key === reading);

  function toggleAll() {
    const next = !allChecked;
    setChecked({ terms: next, privacy: next, age: next });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!allChecked || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onAgree();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="가입 동의"
      onSubmit={(event) => void submit(event)}
      className="mx-auto w-full max-w-[440px] rounded-dash-panel bg-white p-6 shadow-dash-soft mobile:rounded-none mobile:px-4 mobile:shadow-none"
    >
      <span className="inline-block rounded-full border border-dash-line px-2.5 py-0.5 text-[12px] font-bold text-dash-muted">
        초안 — 검토 전
      </span>
      <h1 className="mt-3 break-keep font-dashSerif text-[22px] font-bold leading-snug">
        서비스 이용에 동의해 주세요
      </h1>
      <p className="mt-2 break-keep text-[14px] leading-relaxed text-dash-muted">
        처음 가입할 때 한 번만 확인해요.
      </p>

      <div className="mt-6 rounded-dash-card border border-dash-line">
        <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-dash-line px-4">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="size-5 flex-none accent-dash-ink" />
          <span className="text-[15px] font-bold">전체 동의</span>
        </label>
        <ul className="py-1">
          {ITEMS.map((item) => {
            const inputId = `${idPrefix}-${item.key}`;
            return (
              <li key={item.key} className="flex min-h-12 items-center gap-3 pl-4 pr-2">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked[item.key]}
                  onChange={() => setChecked((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className="size-5 flex-none accent-dash-ink"
                />
                <label htmlFor={inputId} className="flex-1 cursor-pointer py-3 text-[14px]">
                  {item.label}
                </label>
                <button
                  type="button"
                  aria-label={`${item.title} 본문 보기`}
                  onClick={() => setReading(item.key)}
                  className="min-h-11 flex-none px-2 text-[13px] text-dash-muted underline underline-offset-2"
                >
                  보기
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {failed ? (
        <p role="alert" className="mt-3 break-keep text-[13px] text-dash-ink">
          동의를 저장하지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}

      <div className="mt-6 flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={OUTLINE_BUTTON}>
          취소
        </button>
        <button type="submit" disabled={!allChecked || busy} className={FILLED_BUTTON}>
          동의하고 시작하기
        </button>
      </div>

      {readingItem ? (
        <LegalDocDialog title={readingItem.title} body={readingItem.body} onClose={() => setReading(null)} />
      ) : null}
    </form>
  );
}
