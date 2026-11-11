import { act, renderHook, waitFor } from '@testing-library/react';
import { useBookPosition } from './useBookPosition';
import type { PositionResponse } from '../services/positionService';

const fetchPositionMock = vi.fn<(...args: unknown[]) => Promise<PositionResponse>>();

vi.mock('../services/positionService', () => ({
  fetchPosition: (...args: unknown[]) => fetchPositionMock(...args),
}));

function position(over: Partial<PositionResponse> = {}): PositionResponse {
  return { applied_cutoff: 21, current_chapter_no: 3, read_chapter_nos: [1, 2], is_complete: false, ...over };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  fetchPositionMock.mockReset();
});

test('FR-SPL-002: 책 id만으로 요청하고 쪽 번호나 기준점을 보내지 않는다', async () => {
  fetchPositionMock.mockResolvedValue(position());
  const { result } = renderHook(() => useBookPosition('takryu', true));

  await waitFor(() => expect(result.current).toEqual(position()));
  expect(fetchPositionMock).toHaveBeenCalledTimes(1);
  expect(fetchPositionMock.mock.calls[0]).toEqual(['takryu']);
});

test('enabled가 false면 요청하지 않는다', async () => {
  fetchPositionMock.mockResolvedValue(position());
  const { result } = renderHook(() => useBookPosition('takryu', false));

  await act(async () => {});
  expect(fetchPositionMock).not.toHaveBeenCalled();
  expect(result.current).toBeNull();
});

test('enabled가 true로 바뀌면 그때 요청한다', async () => {
  fetchPositionMock.mockResolvedValue(position());
  const { result, rerender } = renderHook(({ enabled }) => useBookPosition('takryu', enabled), {
    initialProps: { enabled: false },
  });
  expect(fetchPositionMock).not.toHaveBeenCalled();

  rerender({ enabled: true });

  await waitFor(() => expect(result.current).toEqual(position()));
  expect(fetchPositionMock).toHaveBeenCalledTimes(1);
});

test('FR-SPL-005: 요청이 실패하면 null이다', async () => {
  fetchPositionMock.mockRejectedValue(new Error('network'));
  const { result } = renderHook(() => useBookPosition('takryu', true));

  await waitFor(() => expect(fetchPositionMock).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(result.current).toBeNull();
});

test('책이 바뀌면 앞 책의 늦은 응답을 쓰지 않는다', async () => {
  const first = deferred<PositionResponse>();
  const second = deferred<PositionResponse>();
  fetchPositionMock.mockImplementation((bookId) =>
    bookId === 'takryu' ? first.promise : second.promise
  );
  const { result, rerender } = renderHook(({ bookId }) => useBookPosition(bookId, true), {
    initialProps: { bookId: 'takryu' },
  });

  rerender({ bookId: 'done-book' });
  expect(result.current).toBeNull();

  const doneBook = position({ applied_cutoff: 20, current_chapter_no: 2, read_chapter_nos: [1, 2], is_complete: true });
  await act(async () => {
    second.resolve(doneBook);
  });
  await act(async () => {
    first.resolve(position({ applied_cutoff: 29, read_chapter_nos: [1, 2] }));
  });

  expect(result.current).toEqual(doneBook);
});

test('FR-SPL-002: A→B→A로 돌아오면 두 번째 A 응답이 오기 전까지 null이다', async () => {
  const firstA = position({ applied_cutoff: 29, current_chapter_no: 3, read_chapter_nos: [1, 2] });
  const secondA = deferred<PositionResponse>();
  let aCalls = 0;
  fetchPositionMock.mockImplementation((bookId) => {
    if (bookId !== 'takryu') return new Promise(() => {});
    aCalls += 1;
    return aCalls === 1 ? Promise.resolve(firstA) : secondA.promise;
  });
  const { result, rerender } = renderHook(({ bookId }) => useBookPosition(bookId, true), {
    initialProps: { bookId: 'takryu' },
  });
  await waitFor(() => expect(result.current).toEqual(firstA));

  rerender({ bookId: 'done-book' });
  rerender({ bookId: 'takryu' });

  expect(result.current).toBeNull();
  await waitFor(() => expect(aCalls).toBe(2));
  expect(result.current).toBeNull();

  const moved = position({ applied_cutoff: 5, current_chapter_no: 1, read_chapter_nos: [] });
  await act(async () => {
    secondA.resolve(moved);
  });
  expect(result.current).toEqual(moved);
});

test('FR-SPL-005: A→B→A에서 두 번째 A 요청이 실패하면 예전 A 응답이 아니라 null이다', async () => {
  let aCalls = 0;
  fetchPositionMock.mockImplementation((bookId) => {
    if (bookId !== 'takryu') return new Promise(() => {});
    aCalls += 1;
    return aCalls === 1 ? Promise.resolve(position()) : Promise.reject(new Error('network'));
  });
  const { result, rerender } = renderHook(({ bookId }) => useBookPosition(bookId, true), {
    initialProps: { bookId: 'takryu' },
  });
  await waitFor(() => expect(result.current).toEqual(position()));

  rerender({ bookId: 'done-book' });
  rerender({ bookId: 'takryu' });
  await waitFor(() => expect(aCalls).toBe(2));
  await act(async () => {});

  expect(result.current).toBeNull();
});

test('FR-SPL-002: 비활성으로 바뀌었다 다시 켜지면 새 응답이 오기 전까지 null이다', async () => {
  const again = deferred<PositionResponse>();
  fetchPositionMock.mockResolvedValueOnce(position()).mockReturnValueOnce(again.promise);
  const { result, rerender } = renderHook(({ enabled }) => useBookPosition('takryu', enabled), {
    initialProps: { enabled: true },
  });
  await waitFor(() => expect(result.current).toEqual(position()));

  rerender({ enabled: false });
  expect(result.current).toBeNull();
  rerender({ enabled: true });

  expect(result.current).toBeNull();
  await waitFor(() => expect(fetchPositionMock).toHaveBeenCalledTimes(2));
  expect(result.current).toBeNull();

  const fresh = position({ applied_cutoff: 11, current_chapter_no: 2, read_chapter_nos: [1] });
  await act(async () => {
    again.resolve(fresh);
  });
  expect(result.current).toEqual(fresh);
});

test('FR-SPL-005: 다시 켜진 뒤 요청이 실패하면 예전 응답이 아니라 null이다', async () => {
  fetchPositionMock.mockResolvedValueOnce(position()).mockRejectedValueOnce(new Error('network'));
  const { result, rerender } = renderHook(({ enabled }) => useBookPosition('takryu', enabled), {
    initialProps: { enabled: true },
  });
  await waitFor(() => expect(result.current).toEqual(position()));

  rerender({ enabled: false });
  rerender({ enabled: true });
  await waitFor(() => expect(fetchPositionMock).toHaveBeenCalledTimes(2));
  await act(async () => {});

  expect(result.current).toBeNull();
});

test('책이 바뀐 직후에는 앞 책의 응답을 보여 주지 않는다', async () => {
  fetchPositionMock.mockImplementation((bookId) =>
    bookId === 'takryu' ? Promise.resolve(position()) : new Promise(() => {})
  );
  const { result, rerender } = renderHook(({ bookId }) => useBookPosition(bookId, true), {
    initialProps: { bookId: 'takryu' },
  });
  await waitFor(() => expect(result.current).toEqual(position()));

  rerender({ bookId: 'done-book' });

  expect(result.current).toBeNull();
});
