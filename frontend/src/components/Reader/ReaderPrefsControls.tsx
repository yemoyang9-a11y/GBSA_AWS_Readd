import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { FONT_SIZES, LINE_HEIGHTS, READER_THEMES, type useReaderPrefs, type ReaderTheme } from '../../hooks/useReaderPrefs';

type PrefsApi = ReturnType<typeof useReaderPrefs>;

const TONES = {
  brief: { text: 'text-brief-ink', muted: 'text-brief-muted', line: 'border-brief-rule', selected: 'border-brief-accent' },
  dash: { text: 'text-dash-ink', muted: 'text-dash-muted', line: 'border-dash-line', selected: 'border-dash-ink' },
};

const THEME_IDS = Object.keys(READER_THEMES) as ReaderTheme[];

function StepButton({ label, disabled, onClick, tone, children }: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  tone: (typeof TONES)['brief'];
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-11 items-center justify-center rounded-full border bg-white ${tone.line} ${tone.text} disabled:opacity-40`}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {children}
      </svg>
    </button>
  );
}

function Stepper({ name, value, list, current, onStep, smaller, larger, tone }: {
  name: string;
  value: string;
  list: readonly number[];
  current: number;
  onStep: (delta: 1 | -1) => void;
  smaller: string;
  larger: string;
  tone: (typeof TONES)['brief'];
}) {
  const index = list.indexOf(current);
  return (
    <div className={`flex min-h-14 items-center justify-between gap-3 border-b ${tone.line}`}>
      <span className={`text-[15px] ${tone.text}`}>{name}</span>
      <span className="flex items-center gap-2">
        <StepButton label={smaller} disabled={index <= 0} onClick={() => onStep(-1)} tone={tone}>
          <path d="M3.5 8h9" />
        </StepButton>
        <span aria-live="polite" className={`w-12 text-center font-dashMono text-[14px] ${tone.text}`}>
          {value}
        </span>
        <StepButton label={larger} disabled={index >= list.length - 1} onClick={() => onStep(1)} tone={tone}>
          <path d="M3.5 8h9M8 3.5v9" />
        </StepButton>
      </span>
    </div>
  );
}

// FR-PRG-001
export default function ReaderPrefsControls({ prefs, stepFont, stepLine, setTheme, tone }: PrefsApi & { tone: 'brief' | 'dash' }) {
  const colors = TONES[tone];
  const radioRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const themeLabelId = useId();

  function onThemeKey(event: KeyboardEvent, theme: ReaderTheme) {
    const offset = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const next = THEME_IDS[(THEME_IDS.indexOf(theme) + offset + THEME_IDS.length) % THEME_IDS.length];
    setTheme(next);
    radioRefs.current[next]?.focus();
  }

  return (
    <div className="font-dashSans">
      <Stepper
        name="글자 크기"
        value={`${prefs.fontSize}px`}
        list={FONT_SIZES}
        current={prefs.fontSize}
        onStep={stepFont}
        smaller="글자 작게"
        larger="글자 크게"
        tone={colors}
      />
      <Stepper
        name="줄 간격"
        value={String(prefs.lineHeight)}
        list={LINE_HEIGHTS}
        current={prefs.lineHeight}
        onStep={stepLine}
        smaller="줄 간격 좁게"
        larger="줄 간격 넓게"
        tone={colors}
      />
      <div className="flex items-center justify-between gap-3 py-3">
        <span id={themeLabelId} className={`text-[15px] ${colors.text}`}>
          배경
        </span>
        <div role="radiogroup" aria-labelledby={themeLabelId} className="flex gap-2">
          {THEME_IDS.map((id) => {
            const theme = READER_THEMES[id];
            const checked = prefs.theme === id;
            return (
              <button
                key={id}
                ref={(el) => {
                  radioRefs.current[id] = el;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => setTheme(id)}
                onKeyDown={(event) => onThemeKey(event, id)}
                className="flex min-w-11 flex-col items-center gap-1"
              >
                <span
                  aria-hidden="true"
                  className={`block size-11 rounded-full border-2 ${checked ? colors.selected : colors.line}`}
                  style={{ background: theme.background }}
                />
                <span className={`text-[12px] ${checked ? `font-bold ${colors.text}` : colors.muted}`}>{theme.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
