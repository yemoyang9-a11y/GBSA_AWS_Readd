import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reader from './Reader';
import { clearPendingJump } from '../utils/pendingJump';

const { enterBookMock, sendProgressMock, fetchPageSpy } = vi.hoisted(() => ({
  enterBookMock: vi.fn(),
  sendProgressMock: vi.fn(),
  fetchPageSpy: vi.fn(),
}));

vi.mock('../services/progressService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/progressService')>();
  return { ...actual, enterBook: enterBookMock, sendProgress: sendProgressMock };
});

vi.mock('../services/bookService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/bookService')>();
  fetchPageSpy.mockImplementation(actual.fetchPage);
  return { ...actual, fetchPage: fetchPageSpy };
});

vi.mock('../hooks/useHeartbeat', () => ({ useHeartbeat: vi.fn() }));

function renderReader() {
  return render(
    <MemoryRouter initialEntries={['/books/takryu/read']}>
      <Routes>
        <Route path="/books/:bookId/read" element={<Reader />} />
        <Route path="/books/:bookId" element={<p>작품 페이지 자리</p>} />
      </Routes>
    </MemoryRouter>
  );
}

async function openedAt(page: number) {
  const input = await screen.findByLabelText<HTMLInputElement>('페이지로 이동');
  await waitFor(() => expect(input.value).toBe(String(page)));
  await waitFor(() => expect(screen.getByRole('article')).toHaveTextContent(`[${page}페이지]`));
  return input;
}

function startAt(page: number) {
  enterBookMock.mockResolvedValue({
    route: 'reader',
    page,
    is_new_session: false,
    session_epoch: 1,
  });
}

function progressPages() {
  return sendProgressMock.mock.calls.map(([, page]) => page);
}

describe('FR-PRG-001: PC 읽기 화면 방향키 이동', () => {
  beforeEach(() => {
    clearPendingJump();
    localStorage.clear();
    sendProgressMock
      .mockReset()
      .mockImplementation((_bookId: string, page: number) => Promise.resolve(page));
    fetchPageSpy.mockClear();
    startAt(25);
  });

  test('→ 키는 다음 쪽, ← 키는 이전 쪽으로 옮긴다', async () => {
    renderReader();
    await openedAt(25);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await openedAt(26);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    await openedAt(25);
    await waitFor(() => expect(progressPages()).toEqual([25, 26, 25]));
  });

  test('절대 규칙 2번: 방향키는 서버가 준 next_page·prev_page 로만 옮긴다', async () => {
    const actual = fetchPageSpy.getMockImplementation()!;
    fetchPageSpy.mockImplementation(async (bookId: string, page: number) => {
      const res = await actual(bookId, page);
      return page === 25 ? { ...res, prev_page: 3, next_page: 28 } : res;
    });
    try {
      renderReader();
      await openedAt(25);
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      await openedAt(28);
      fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
      await openedAt(27);
    } finally {
      fetchPageSpy.mockImplementation(actual);
    }
  });

  test('쪽 번호 입력칸에 커서가 있으면 방향키로 쪽이 넘어가지 않는다', async () => {
    renderReader();
    const input = await openedAt(25);
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.tabIndex = 0;
    const select = document.createElement('select');
    document.body.append(textarea, editable, select);
    for (const el of [textarea, editable, select]) {
      el.focus();
      fireEvent.keyDown(el, { key: 'ArrowRight' });
    }
    textarea.remove();
    editable.remove();
    select.remove();
    await new Promise((r) => setTimeout(r, 50));
    expect(input.value).toBe('25');
    expect(progressPages()).toEqual([25]);
  });

  test('수정키와 함께 누르거나 글자 조합 중이면 쪽이 넘어가지 않는다', async () => {
    renderReader();
    const input = await openedAt(25);
    for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) {
      fireEvent.keyDown(document.body, { key: 'ArrowRight', [mod]: true });
    }
    fireEvent.keyDown(document.body, { key: 'ArrowRight', isComposing: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(input.value).toBe('25');
    expect(progressPages()).toEqual([25]);
  });

  test('보기 설정 창이 열려 있으면 쪽이 넘어가지 않고, 닫으면 다시 넘어간다', async () => {
    renderReader();
    const input = await openedAt(25);
    fireEvent.click(screen.getByRole('button', { name: '보기 설정' }));
    expect(screen.getByRole('dialog', { name: '보기 설정' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await new Promise((r) => setTimeout(r, 50));
    expect(input.value).toBe('25');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '보기 설정' })).toBeNull());
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await openedAt(26);
  });

  test('첫 쪽에서 ← 키, 마지막 쪽에서 → 키는 아무것도 하지 않는다', async () => {
    startAt(1);
    const first = renderReader();
    const input = await openedAt(1);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    await new Promise((r) => setTimeout(r, 50));
    expect(input.value).toBe('1');
    expect(progressPages()).toEqual([1]);
    first.unmount();

    sendProgressMock.mockClear();
    startAt(30);
    renderReader();
    const last = await openedAt(30);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await new Promise((r) => setTimeout(r, 50));
    expect(last.value).toBe('30');
    expect(progressPages()).toEqual([30]);
  });
});
