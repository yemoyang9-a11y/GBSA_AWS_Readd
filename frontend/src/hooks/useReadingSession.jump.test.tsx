import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useReadingSession } from './useReadingSession';
import { clearPendingJump, setPendingJump } from '../utils/pendingJump';
import type { BookInfoResponse } from '../types';

const { fetchBookInfoMock, fetchPageMock, enterBookMock, sendProgressMock } = vi.hoisted(() => ({
  fetchBookInfoMock: vi.fn(),
  fetchPageMock: vi.fn(),
  enterBookMock: vi.fn(),
  sendProgressMock: vi.fn(),
}));

vi.mock('../services/bookService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/bookService')>();
  return { ...actual, fetchBookInfo: fetchBookInfoMock, fetchPage: fetchPageMock };
});

vi.mock('../services/progressService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/progressService')>();
  return { ...actual, enterBook: enterBookMock, sendProgress: sendProgressMock };
});

const INFO: BookInfoResponse = {
  basic_info: { title: '탁류', author: '채만식', published_year: 1937, length_note: '100페이지' },
  introduction: null,
  background: null,
  chapters: [
    { chapter_no: 1, title: '첫째', start_page: 1, end_page: 39 },
    { chapter_no: 2, title: '둘째', start_page: 40, end_page: 57 },
    { chapter_no: 3, title: '셋째', start_page: 58, end_page: 100 },
  ],
} as unknown as BookInfoResponse;

const SERVER_PAGE = 40;

function progressPages() {
  return sendProgressMock.mock.calls.map(([, page]) => page);
}

async function startReading(bookId = 'takryu', wrapper?: ({ children }: { children: ReactNode }) => JSX.Element) {
  const rendered = renderHook(() => useReadingSession(bookId), { wrapper });
  await waitFor(() => expect(rendered.result.current.page).not.toBeNull());
  await waitFor(() => expect(rendered.result.current.totalPages).toBe(100));
  await waitFor(() => expect(sendProgressMock).toHaveBeenCalled());
  return rendered;
}

describe('useReadingSession — 목차에서 고른 장으로 옮기기', () => {
  beforeEach(() => {
    clearPendingJump();
    localStorage.clear();
    sessionStorage.clear();
    fetchBookInfoMock.mockReset().mockResolvedValue(INFO);
    fetchPageMock.mockReset().mockImplementation((_bookId: string, pageNo: number) =>
      Promise.resolve({
        page_no: pageNo,
        content: `${pageNo}쪽 본문`,
        prev_page: pageNo > 1 ? pageNo - 1 : null,
        next_page: pageNo < 100 ? pageNo + 1 : null,
      })
    );
    enterBookMock
      .mockReset()
      .mockResolvedValue({ route: 'reader', page: SERVER_PAGE, is_new_session: false, session_epoch: 1 });
    sendProgressMock.mockReset().mockImplementation((_bookId: string, page: number) => Promise.resolve(page));
  });
  afterEach(() => vi.restoreAllMocks());

  test('FR-PRG-003: 이동 예약이 있으면 진입 뒤 그 쪽으로 옮기고 진도 요청을 한 번 보낸다', async () => {
    setPendingJump('takryu', 58);
    const { result } = await startReading();
    await waitFor(() => expect(result.current.currentPage).toBe(58));
    expect(result.current.page?.page_no).toBe(58);
    expect(progressPages()).toEqual([58]);
  });

  test('FR-PRG-003: StrictMode의 이중 렌더·이중 effect에서도 예약을 한 번 쓰고 진도 요청은 그 쪽 한 번뿐이다', async () => {
    setPendingJump('takryu', 58);
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = await startReading('takryu', wrapper);
    await waitFor(() => expect(result.current.currentPage).toBe(58));
    expect(result.current.jumpOrigin).toBe(SERVER_PAGE);
    expect(progressPages()).toEqual([58]);
  });

  test('FR-PRG-003: 이동 예약이 없으면 서버가 준 쪽에서 시작하고 진도 요청은 그 쪽 한 번뿐이다', async () => {
    const { result } = await startReading();
    expect(result.current.currentPage).toBe(SERVER_PAGE);
    expect(progressPages()).toEqual([SERVER_PAGE]);
  });

  test('FR-PRG-003: 예약은 한 번만 쓰인다 — 화면을 다시 열면 서버가 준 쪽에서 시작한다', async () => {
    setPendingJump('takryu', 58);
    const first = await startReading();
    await waitFor(() => expect(first.result.current.currentPage).toBe(58));
    first.unmount();
    sendProgressMock.mockClear();

    const { result } = await startReading();
    expect(result.current.currentPage).toBe(SERVER_PAGE);
    expect(progressPages()).toEqual([SERVER_PAGE]);
  });

  test('FR-PRG-003: 다른 책의 예약은 쓰지 않는다', async () => {
    setPendingJump('other-book', 58);
    const { result } = await startReading();
    expect(result.current.currentPage).toBe(SERVER_PAGE);
    expect(progressPages()).toEqual([SERVER_PAGE]);
  });

  test.each([0, 101])('FR-PRG-003: 예약한 쪽이 범위를 벗어나면 옮기지 않는다 (%i)', async (page) => {
    setPendingJump('takryu', page);
    const { result } = await startReading();
    expect(result.current.currentPage).toBe(SERVER_PAGE);
    expect(result.current.jumpOrigin).toBeNull();
    expect(progressPages()).toEqual([SERVER_PAGE]);
  });

  test('FR-PRG-003: 책 정보를 못 불러와 범위를 모르면 예약을 쓰지 않고 서버가 준 쪽에서 시작한다', async () => {
    fetchBookInfoMock.mockReset().mockRejectedValue(new Error('down'));
    setPendingJump('takryu', 58);
    const { result } = renderHook(() => useReadingSession('takryu'));
    await waitFor(() => expect(result.current.page?.page_no).toBe(SERVER_PAGE));
    expect(result.current.jumpOrigin).toBeNull();
    expect(progressPages()).toEqual([SERVER_PAGE]);
  });

  test('FR-PRG-003: location.state에 쪽이 들어 있어도 시작 쪽으로 쓰지 않는다', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[{ pathname: '/books/takryu/read', state: { page: 77, jump: 77, entry: { page: 77 } } }]}>
        {children}
      </MemoryRouter>
    );
    const { result } = await startReading('takryu', wrapper);
    expect(result.current.currentPage).toBe(SERVER_PAGE);
    expect(progressPages()).toEqual([SERVER_PAGE]);
  });

  test('FR-PRG-003: 이동 예약으로 옮기면 jumpOrigin은 옮기기 전 쪽이다', async () => {
    setPendingJump('takryu', 58);
    const { result } = await startReading();
    await waitFor(() => expect(result.current.currentPage).toBe(58));
    expect(result.current.jumpOrigin).toBe(SERVER_PAGE);
  });

  test('FR-PRG-003: 이동 예약이 없으면 jumpOrigin은 null이다', async () => {
    const { result } = await startReading();
    expect(result.current.jumpOrigin).toBeNull();
  });

  test('FR-PRG-003: 예약한 쪽이 지금 쪽과 같으면 jumpOrigin은 null이다', async () => {
    setPendingJump('takryu', SERVER_PAGE);
    const { result } = await startReading();
    expect(result.current.currentPage).toBe(SERVER_PAGE);
    expect(result.current.jumpOrigin).toBeNull();
    expect(progressPages()).toEqual([SERVER_PAGE]);
  });

  test('FR-PRG-003: returnToOrigin은 그 쪽으로 옮기고 진도 요청을 한 번 보낸 뒤 jumpOrigin을 비운다', async () => {
    setPendingJump('takryu', 58);
    const { result } = await startReading();
    await waitFor(() => expect(result.current.currentPage).toBe(58));

    act(() => result.current.returnToOrigin());
    await waitFor(() => expect(result.current.currentPage).toBe(SERVER_PAGE));
    await waitFor(() => expect(progressPages()).toEqual([58, SERVER_PAGE]));
    expect(result.current.jumpOrigin).toBeNull();
  });

  test('FR-PRG-003: dismissJumpOrigin은 요청 없이 jumpOrigin만 비운다', async () => {
    setPendingJump('takryu', 58);
    const { result } = await startReading();
    await waitFor(() => expect(result.current.jumpOrigin).toBe(SERVER_PAGE));

    act(() => result.current.dismissJumpOrigin());
    expect(result.current.jumpOrigin).toBeNull();
    expect(result.current.currentPage).toBe(58);
    expect(progressPages()).toEqual([58]);
  });

  test('FR-PRG-003: 쪽을 넘겨도 jumpOrigin은 그대로다', async () => {
    setPendingJump('takryu', 58);
    const { result } = await startReading();
    await waitFor(() => expect(result.current.currentPage).toBe(58));

    act(() => result.current.moveTo(59));
    await waitFor(() => expect(result.current.currentPage).toBe(59));
    expect(result.current.jumpOrigin).toBe(SERVER_PAGE);
  });

  test('FR-BRF-005: jumpOrigin은 저장소에 쓰이지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setPendingJump('takryu', 58);
    const { result } = await startReading();
    await waitFor(() => expect(result.current.jumpOrigin).toBe(SERVER_PAGE));
    act(() => result.current.moveTo(59));
    act(() => result.current.dismissJumpOrigin());
    expect(setItem).not.toHaveBeenCalled();
  });
});
