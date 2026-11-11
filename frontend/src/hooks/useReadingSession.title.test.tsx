import { act, renderHook, waitFor } from '@testing-library/react';
import { useReadingSession } from './useReadingSession';
import { mockBookInfo, mockChapters } from '../../mocks/fixtures';

const { fetchBookInfoMock, enterBookMock } = vi.hoisted(() => ({
  fetchBookInfoMock: vi.fn(),
  enterBookMock: vi.fn(),
}));

vi.mock('../services/bookService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/bookService')>();
  return { ...actual, fetchBookInfo: fetchBookInfoMock };
});

vi.mock('../services/progressService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/progressService')>();
  return { ...actual, enterBook: enterBookMock, sendProgress: vi.fn().mockResolvedValue(15) };
});

describe('useReadingSession — 윗줄 표시 값', () => {
  beforeEach(() => {
    fetchBookInfoMock.mockReset().mockResolvedValue(mockBookInfo);
    enterBookMock.mockReset().mockResolvedValue({ route: 'reader', page: 15, is_new_session: false, session_epoch: 1 });
  });

  test('bookTitle은 책 정보의 제목이다', async () => {
    const { result } = renderHook(() => useReadingSession('takryu'));
    await waitFor(() => expect(result.current.bookTitle).toBe('탁류'));
  });

  test('currentChapter는 지금 쪽이 들어 있는 장이다', async () => {
    const { result } = renderHook(() => useReadingSession('takryu'));
    await waitFor(() => expect(result.current.currentChapter).toEqual(mockChapters[1]));
    act(() => result.current.moveTo(21));
    await waitFor(() => expect(result.current.currentChapter).toEqual(mockChapters[2]));
  });

  test('FR-SPL-005: 책 정보를 못 불러와도 page는 뜨고 bookTitle은 null이다', async () => {
    fetchBookInfoMock.mockReset().mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useReadingSession('takryu'));
    await waitFor(() => expect(result.current.page?.page_no).toBe(15));
    expect(result.current.bookTitle).toBeNull();
    expect(result.current.currentChapter).toBeNull();
  });
});
