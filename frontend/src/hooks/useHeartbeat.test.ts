import { renderHook } from '@testing-library/react';
import { useHeartbeat } from './useHeartbeat';
import { HEARTBEAT_INTERVAL_MS } from '../utils/constants';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

/**
 * 하트비트 (A2)
 *
 * 마지막 조작 시각만 갱신한다. 진도·기준점에 관여하지 않으므로 seq 를 쓰지 않는다.
 * **화면이 보이는 동안만** 보낸다 — 이건 최적화가 아니라 정확성 문제다. 백그라운드
 * 탭에서도 계속 보내면 세션이 영원히 끝나지 않아, 세션 종료 시 만들어지는 저장 리캡
 * (FR-DAT-009)이 아예 생성되지 않는다.
 */
describe('하트비트', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('A2: 5분마다 보낸다', () => {
    const send = vi.fn();
    renderHook(() => useHeartbeat({ bookId: 'takryu', send }));

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('takryu');

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('주기가 되기 전에는 보내지 않는다', () => {
    const send = vi.fn();
    renderHook(() => useHeartbeat({ bookId: 'takryu', send }));

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS - 1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('화면이 숨으면 멈춘다 — 백그라운드 탭이 세션을 붙잡아 두면 저장 리캡이 생성되지 않는다', () => {
    const send = vi.fn();
    renderHook(() => useHeartbeat({ bookId: 'takryu', send }));

    setVisibility('hidden');
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);

    expect(send).not.toHaveBeenCalled();
  });

  it('화면이 다시 보이면 재개한다', () => {
    const send = vi.fn();
    renderHook(() => useHeartbeat({ bookId: 'takryu', send }));

    setVisibility('hidden');
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
    setVisibility('visible');
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('화면을 벗어나면 더 보내지 않는다', () => {
    const send = vi.fn();
    const { unmount } = renderHook(() => useHeartbeat({ bookId: 'takryu', send }));

    unmount();
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);

    expect(send).not.toHaveBeenCalled();
  });
});
