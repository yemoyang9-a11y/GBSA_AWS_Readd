import { act, renderHook } from '@testing-library/react';
import { useReaderPrefs } from './useReaderPrefs';

const KEY = 'readd.readerPrefs';

function stored() {
  return JSON.parse(localStorage.getItem(KEY) ?? 'null');
}

describe('useReaderPrefs', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  test('기본값은 18px, 줄 간격 2다', () => {
    const { result } = renderHook(() => useReaderPrefs());
    expect(result.current.prefs.fontSize).toBe(18);
    expect(result.current.prefs.lineHeight).toBe(2);
  });

  test('stepFont(1)은 20px로 올리고 저장한다', () => {
    const { result } = renderHook(() => useReaderPrefs());
    act(() => result.current.stepFont(1));
    expect(result.current.prefs.fontSize).toBe(20);
    expect(stored().fontSize).toBe(20);
  });

  test('stepLine(-1)은 1.8로 내리고 저장한다', () => {
    const { result } = renderHook(() => useReaderPrefs());
    act(() => result.current.stepLine(-1));
    expect(result.current.prefs.lineHeight).toBe(1.8);
    expect(stored().lineHeight).toBe(1.8);
  });

  test('FR-PRG-001: 범위 끝(22px)에서 stepFont(1)은 값을 바꾸지 않는다', () => {
    localStorage.setItem(KEY, JSON.stringify({ fontSize: 22 }));
    const { result } = renderHook(() => useReaderPrefs());
    act(() => result.current.stepFont(1));
    expect(result.current.prefs.fontSize).toBe(22);
  });

  test('범위 끝(16px)에서 stepFont(-1)은 값을 바꾸지 않는다', () => {
    localStorage.setItem(KEY, JSON.stringify({ fontSize: 16 }));
    const { result } = renderHook(() => useReaderPrefs());
    act(() => result.current.stepFont(-1));
    expect(result.current.prefs.fontSize).toBe(16);
  });

  test('저장된 값이 목록에 없으면 기본값을 쓴다', () => {
    localStorage.setItem(KEY, '{"fontSize":999}');
    const { result } = renderHook(() => useReaderPrefs());
    expect(result.current.prefs.fontSize).toBe(18);
  });

  test('저장된 값이 깨진 JSON이면 기본값을 쓴다', () => {
    localStorage.setItem(KEY, '{fontSize:');
    const { result } = renderHook(() => useReaderPrefs());
    expect(result.current.prefs).toEqual({ fontSize: 18, lineHeight: 2, theme: 'paper' });
  });

  test('localStorage가 예외를 던져도 기본값으로 동작한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useReaderPrefs());
    expect(result.current.prefs).toEqual({ fontSize: 18, lineHeight: 2, theme: 'paper' });
    act(() => result.current.stepFont(1));
    expect(result.current.prefs.fontSize).toBe(20);
  });

  test('기본 배경은 paper다', () => {
    const { result } = renderHook(() => useReaderPrefs());
    expect(result.current.prefs.theme).toBe('paper');
  });

  test("setTheme('dark')는 값을 바꾸고 저장한다", () => {
    const { result } = renderHook(() => useReaderPrefs());
    act(() => result.current.setTheme('dark'));
    expect(result.current.prefs.theme).toBe('dark');
    expect(stored().theme).toBe('dark');
  });

  test('저장된 배경이 목록에 없으면 paper를 쓰고 글자 크기는 저장된 값을 쓴다', () => {
    localStorage.setItem(KEY, '{"fontSize":20,"theme":"neon"}');
    const { result } = renderHook(() => useReaderPrefs());
    expect(result.current.prefs.theme).toBe('paper');
    expect(result.current.prefs.fontSize).toBe(20);
  });

  test('배경 값이 없는 옛 저장값도 읽는다', () => {
    localStorage.setItem(KEY, '{"fontSize":20,"lineHeight":2}');
    const { result } = renderHook(() => useReaderPrefs());
    expect(result.current.prefs).toEqual({ fontSize: 20, lineHeight: 2, theme: 'paper' });
  });

  test('toString 같은 객체 기본 속성 이름은 배경으로 받지 않는다', () => {
    localStorage.setItem(KEY, '{"theme":"toString"}');
    const { result } = renderHook(() => useReaderPrefs());
    expect(result.current.prefs.theme).toBe('paper');
  });
});
