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
