import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reader from './Reader';
import { clearPendingJump, setPendingJump } from '../utils/pendingJump';

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

describe('PC 읽기 화면 윗줄', () => {
  beforeEach(() => {
    clearPendingJump();
    localStorage.clear();
    enterBookMock.mockReset().mockResolvedValue({ route: 'reader', page: 21, is_new_session: false, session_epoch: 1 });
    sendProgressMock.mockReset().mockImplementation((_bookId: string, page: number) => Promise.resolve(page));
    fetchPageSpy.mockClear();
  });

  test('FR-PRG-004: 윗줄에 책 이름과 장 이름이 보이고 진도 막대는 없다', async () => {
    renderReader();
    await openedAt(21);
    expect(await screen.findByText('탁류 · 3장 신판 흥부전')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  test('쪽을 넘기면 장 이름이 그 쪽의 장으로 바뀐다', async () => {
    const user = userEvent.setup();
    enterBookMock.mockResolvedValue({ route: 'reader', page: 20, is_new_session: false, session_epoch: 1 });
    renderReader();
    await openedAt(20);
    expect(await screen.findByText('탁류 · 2장 생활 제일과')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(await screen.findByText('탁류 · 3장 신판 흥부전')).toBeInTheDocument();
  });

  test('목차에서 옮겨 왔으면 돌아가기 줄이 보이고, 누르면 읽던 쪽이 열리고 줄이 사라진다', async () => {
    const user = userEvent.setup();
    setPendingJump('takryu', 11);
    renderReader();
    await openedAt(11);
    const bar = screen.getByRole('status');
    expect(bar).toHaveTextContent('21쪽에서 옮겨 왔어요');
    await user.click(within(bar).getByRole('button', { name: '읽던 곳으로 돌아가기' }));
    await openedAt(21);
    expect(screen.queryByText(/쪽에서 옮겨 왔어요/)).toBeNull();
  });

  test('목차에서 옮겨 오지 않았으면 돌아가기 줄이 없다', async () => {
    renderReader();
    await openedAt(21);
    expect(screen.queryByText(/쪽에서 옮겨 왔어요/)).toBeNull();
    expect(screen.queryByRole('button', { name: '읽던 곳으로 돌아가기' })).toBeNull();
  });

  test('돌아가기 줄의 닫기를 누르면 줄만 사라지고 쪽은 그대로다', async () => {
    const user = userEvent.setup();
    setPendingJump('takryu', 11);
    renderReader();
    await openedAt(11);
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: '닫기' }));
    expect(screen.queryByText(/쪽에서 옮겨 왔어요/)).toBeNull();
    await openedAt(11);
    expect(sendProgressMock.mock.calls.map(([, page]) => page)).toEqual([11]);
  });

  test('뒤로 가기는 작품 페이지로 간다', async () => {
    const user = userEvent.setup();
    renderReader();
    await openedAt(21);
    await user.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(await screen.findByText('작품 페이지 자리')).toBeInTheDocument();
  });

  test('읽기 화면 어디에도 아모가 몇 쪽까지 아는지 알리는 글자가 없다', async () => {
    const user = userEvent.setup();
    setPendingJump('takryu', 11);
    renderReader();
    await openedAt(11);
    expect(screen.queryByText(/까지 (읽음|알고)/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '싸비 열기' }));
    expect(await screen.findByText('아모의 가이드북')).toBeInTheDocument();
    expect(screen.queryByText(/까지 (읽음|알고)/)).toBeNull();
  });

  test('보기 설정 버튼을 누르면 대화상자가 열리고 Esc로 닫힌다', async () => {
    const user = userEvent.setup();
    renderReader();
    await openedAt(21);
    const opener = screen.getByRole('button', { name: '보기 설정' });
    expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: '보기 설정' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '보기 설정' })).toBeNull();
  });

  test('FR-PRG-001: 글자를 키워도 쪽 번호와 본문 내용이 같고 쪽 요청을 다시 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderReader();
    const input = await openedAt(21);
    const article = screen.getByRole('article');
    const before = article.textContent;
    const fetches = fetchPageSpy.mock.calls.length;

    await user.click(screen.getByRole('button', { name: '보기 설정' }));
    await user.click(screen.getByRole('button', { name: '글자 크게' }));

    expect(article.style.fontSize).toBe('20px');
    expect(input.value).toBe('21');
    expect(screen.getByRole('article').textContent).toBe(before);
    expect(fetchPageSpy.mock.calls.length).toBe(fetches);
  });

  test('FR-PRG-003: 보기 설정을 바꿔도 진도 요청을 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderReader();
    await openedAt(21);
    await waitFor(() => expect(sendProgressMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: '보기 설정' }));
    await user.click(screen.getByRole('button', { name: '글자 크게' }));
    await user.click(screen.getByRole('button', { name: '줄 간격 넓게' }));

    expect(sendProgressMock).toHaveBeenCalledTimes(1);
  });

  test('FR-PRG-003: 배경을 바꿔도 쪽 요청과 진도 요청을 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderReader();
    await openedAt(21);
    await waitFor(() => expect(sendProgressMock).toHaveBeenCalledTimes(1));
    const fetches = fetchPageSpy.mock.calls.length;

    await user.click(screen.getByRole('button', { name: '보기 설정' }));
    await user.click(screen.getByRole('radio', { name: '세피아' }));
    await user.click(screen.getByRole('radio', { name: '어두운' }));

    expect(sendProgressMock).toHaveBeenCalledTimes(1);
    expect(fetchPageSpy.mock.calls.length).toBe(fetches);
  });

  test('배경을 어두운으로 바꾸면 본문 영역의 배경과 글자색만 바뀌고 윗줄 색은 그대로다', async () => {
    const user = userEvent.setup();
    renderReader();
    await openedAt(21);
    const topbar = screen.getByRole('button', { name: '뒤로 가기' }).parentElement!;
    const topbarClass = topbar.className;

    await user.click(screen.getByRole('button', { name: '보기 설정' }));
    await user.click(screen.getByRole('radio', { name: '어두운' }));

    const article = screen.getByRole('article');
    expect(article.style.background).toBe('rgb(28, 27, 25)');
    expect(article.style.color).toBe('rgb(217, 214, 207)');
    expect(screen.getByRole('radio', { name: '어두운' })).toHaveAttribute('aria-checked', 'true');
    expect(topbar.className).toBe(topbarClass);
    expect(topbar.style.background).toBe('');
  });
});
