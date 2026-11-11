import { useCallback, useState } from 'react';

export const FONT_SIZES = [16, 18, 20, 22] as const;
export const LINE_HEIGHTS = [1.8, 2, 2.2] as const;
export const READER_THEMES = {
  paper: { background: '#fdfdfa', color: '#272623', label: '기본' },
  sepia: { background: '#f4ecd8', color: '#3b3024', label: '세피아' },
  dark: { background: '#1c1b19', color: '#d9d6cf', label: '어두운' },
} as const;
export type ReaderTheme = keyof typeof READER_THEMES;
export interface ReaderPrefs {
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
}

const STORAGE_KEY = 'readd.readerPrefs';
export const DEFAULT_READER_PREFS: ReaderPrefs = { fontSize: 18, lineHeight: 2, theme: 'paper' };

function pick<T>(list: readonly T[], value: unknown, fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

function isTheme(value: unknown): value is ReaderTheme {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(READER_THEMES, value);
}

function readPrefs(): ReaderPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_READER_PREFS;
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== 'object' || saved === null) return DEFAULT_READER_PREFS;
    const { fontSize, lineHeight, theme } = saved as Record<string, unknown>;
    return {
      fontSize: pick(FONT_SIZES, fontSize, DEFAULT_READER_PREFS.fontSize),
      lineHeight: pick(LINE_HEIGHTS, lineHeight, DEFAULT_READER_PREFS.lineHeight),
      theme: isTheme(theme) ? theme : DEFAULT_READER_PREFS.theme,
    };
  } catch {
    return DEFAULT_READER_PREFS;
  }
}

function writePrefs(prefs: ReaderPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    return;
  }
}

function step(list: readonly number[], current: number, delta: 1 | -1): number {
  const index = list.indexOf(current);
  return list[Math.min(list.length - 1, Math.max(0, index + delta))];
}

// FR-PRG-001
export function useReaderPrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(readPrefs);

  const update = useCallback((change: (prev: ReaderPrefs) => ReaderPrefs) => {
    setPrefs((prev) => {
      const next = change(prev);
      if (next !== prev) writePrefs(next);
      return next;
    });
  }, []);

  const stepFont = useCallback(
    (delta: 1 | -1) => update((prev) => ({ ...prev, fontSize: step(FONT_SIZES, prev.fontSize, delta) })),
    [update]
  );
  const stepLine = useCallback(
    (delta: 1 | -1) => update((prev) => ({ ...prev, lineHeight: step(LINE_HEIGHTS, prev.lineHeight, delta) })),
    [update]
  );
  const setTheme = useCallback((theme: ReaderTheme) => update((prev) => ({ ...prev, theme })), [update]);

  return { prefs, stepFont, stepLine, setTheme };
}
