import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import BookDetail from '../../pages/BookDetail';
import Home from '../../pages/Home';
import RequireLogin from './RequireLogin';
import { startLogin } from '../../services/authService';
import { takeLoginReturn } from '../../utils/loginReturn';
import { setAuthToken } from '../../utils/storage';
import type { BookInfoResponse, BookSummary, CatalogResponse, EntryResponse } from '../../types';

const enterBookMock = vi.fn<(bookId: string) => Promise<EntryResponse>>();

vi.mock('../../services/bookService', () => ({
  fetchCatalog: (): Promise<CatalogResponse> => Promise.resolve({ books: [TAKRYU] }),
  fetchBookInfo: (): Promise<BookInfoResponse> => Promise.resolve(TAKRYU_INFO),
}));
vi.mock('../../services/positionService', () => ({
  fetchPosition: () =>
    Promise.resolve({ applied_cutoff: 21, current_chapter_no: 1, read_chapter_nos: [], is_complete: false }),
}));
vi.mock('../../services/progressService', () => ({
  enterBook: (bookId: string) => enterBookMock(bookId),
  sendProgress: vi.fn(),
  sendHeartbeat: vi.fn(),
}));
vi.mock('../../services/authService', () => ({ startLogin: vi.fn() }));

const TAKRYU: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  genre: null,
  registered_at: '2026-10-01T00:00:00.000Z',
  progress: { current_page: 21, percent: 12.2, is_complete: false, last_read_at: '2026-11-09T00:00:00.000Z' },
};
const TAKRYU_INFO: BookInfoResponse = {
  basic_info: { title: '탁류', author: '채만식', published_year: 1937, length_note: '30페이지' },
  introduction: '소개.',
  background: '배경.',
  chapters: [{ chapter_no: 1, title: '인간기념물', start_page: 1, end_page: 30 }],
};

function Probe({ name }: { name: string }) {
  return <p data-testid="probe">{`${name} ${useLocation().pathname}`}</p>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Home /> },
      { path: '/books/:bookId', element: <BookDetail /> },
      { path: '/books/:bookId/briefing', element: <RequireLogin><Probe name="브리핑" /></RequireLogin> },
      { path: '/books/:bookId/read', element: <RequireLogin><Probe name="읽기" /></RequireLogin> },
    ],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

async function clickRead() {
  await userEvent.click(await screen.findByRole('button', { name: /이어서 읽기|읽기 시작/ }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  enterBookMock.mockReset();
  enterBookMock.mockResolvedValue({ route: 'reader', page: 21, is_new_session: false, session_epoch: 1 });
  vi.mocked(startLogin).mockReset();
});

test('로그인하지 않은 사람이 작품 페이지에서 읽기를 누르면 로그인 창이 뜨고 진입 요청은 0건이다', async () => {
  renderAt('/books/takryu');
  await clickRead();

  expect(await screen.findByRole('dialog', { name: '로그인' })).toBeInTheDocument();
  expect(enterBookMock).not.toHaveBeenCalled();
});

test('로그인하지 않은 사람이 홈의 이어 읽기를 누르면 로그인 창이 뜨고 진입 요청은 0건이다', async () => {
  renderAt('/');
  await userEvent.click(await screen.findByRole('button', { name: /이어서 읽기/ }));

  expect(await screen.findByRole('dialog', { name: '로그인' })).toBeInTheDocument();
  expect(enterBookMock).not.toHaveBeenCalled();
});

test('로그인한 사용자에게는 로그인 창이 뜨지 않고 바로 진입한다', async () => {
  setAuthToken('jwt');
  renderAt('/books/takryu');
  await clickRead();

  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('읽기 /books/takryu/read'));
  expect(enterBookMock).toHaveBeenCalledWith('takryu');
  expect(screen.queryByRole('dialog', { name: '로그인' })).not.toBeInTheDocument();
});

test('로그인 창의 카카오 버튼은 열려던 책을 기억하고 카카오 로그인을 시작한다', async () => {
  renderAt('/books/takryu');
  await clickRead();
  await userEvent.click(await screen.findByRole('button', { name: '카카오 로그인' }));

  expect(startLogin).toHaveBeenCalledWith('kakao');
  expect(takeLoginReturn()).toBe('takryu');
});

test('로그인 창의 구글 버튼은 열려던 책을 기억하고 구글 로그인을 시작한다', async () => {
  renderAt('/books/takryu');
  await clickRead();
  await userEvent.click(await screen.findByRole('button', { name: 'Google 로그인' }));

  expect(startLogin).toHaveBeenCalledWith('google');
  expect(takeLoginReturn()).toBe('takryu');
});

test('로그인 창은 아이디·비밀번호 칸 없이 버튼 두 개만 있다', async () => {
  renderAt('/books/takryu');
  await clickRead();
  const dialog = await screen.findByRole('dialog', { name: '로그인' });

  expect(dialog.querySelectorAll('input')).toHaveLength(0);
  expect(screen.getByText('SNS 계정으로 로그인/가입')).toBeInTheDocument();
});

test('로그인 창을 닫으면 작품 페이지에 그대로 남는다', async () => {
  renderAt('/books/takryu');
  await clickRead();
  await userEvent.click(await screen.findByRole('button', { name: '닫기' }));

  expect(screen.queryByRole('dialog', { name: '로그인' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '탁류' })).toBeInTheDocument();
});

test('로그인하지 않은 사람이 읽기 화면 주소로 바로 들어오면 읽기 화면 대신 로그인 창이 뜬다', async () => {
  renderAt('/books/takryu/read');

  expect(await screen.findByRole('dialog', { name: '로그인' })).toBeInTheDocument();
  expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
});

test('로그인하지 않은 사람이 브리핑 주소로 바로 들어오면 브리핑 대신 로그인 창이 뜬다', async () => {
  renderAt('/books/takryu/briefing');

  expect(await screen.findByRole('dialog', { name: '로그인' })).toBeInTheDocument();
  expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
});

test('읽기 주소에서 뜬 로그인 창을 닫으면 작품 페이지로 간다', async () => {
  const router = renderAt('/books/takryu/read');
  await userEvent.click(await screen.findByRole('button', { name: '닫기' }));

  await waitFor(() => expect(router.state.location.pathname).toBe('/books/takryu'));
});

test('로그인한 사용자는 읽기 주소로 바로 들어가도 로그인 창이 없다', async () => {
  setAuthToken('jwt');
  renderAt('/books/takryu/read');

  expect(screen.getByTestId('probe')).toHaveTextContent('읽기 /books/takryu/read');
  expect(screen.queryByRole('dialog', { name: '로그인' })).not.toBeInTheDocument();
});
