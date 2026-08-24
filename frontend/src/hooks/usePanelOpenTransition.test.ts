import { act, renderHook } from '@testing-library/react';
import { usePanelOpenTransition } from './usePanelOpenTransition';

describe('usePanelOpenTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('open이 true면 즉시 렌더 상태다', () => {
    const { result } = renderHook(() => usePanelOpenTransition(true, 260));
    expect(result.current).toBe(true);
  });

  it('open이 false가 돼도 durationMs 동안은 렌더 상태를 유지한다', () => {
    const { result, rerender } = renderHook(({ open }) => usePanelOpenTransition(open, 260), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    expect(result.current).toBe(true); // 애니메이션 중 — 아직 언마운트 안 함

    act(() => {
      vi.advanceTimersByTime(259);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false); // 260ms 지나면 언마운트 반영
  });

  it('닫히는 도중 다시 열면 언마운트 타이머를 취소한다', () => {
    const { result, rerender } = renderHook(({ open }) => usePanelOpenTransition(open, 260), {
      initialProps: { open: true },
    });
    rerender({ open: false });

    act(() => {
      vi.advanceTimersByTime(150); // 절반쯤 지났을 때 다시 연다
    });
    rerender({ open: true });

    act(() => {
      vi.advanceTimersByTime(1000); // 취소됐으니 아무리 기다려도 false가 되면 안 된다
    });
    expect(result.current).toBe(true);
  });
});
