import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Home from './Home';
import { mockCatalog } from '../../mocks/fixtures';
import type { BookSummary, CatalogResponse, EntryResponse } from '../types';

const fetchCatalogMock = vi.fn<() => Promise<CatalogResponse>>();
const enterBookMock = vi.fn<(bookId: string) => Promise<EntryResponse>>();

vi.mock('../services/bookService', () => ({
  fetchCatalog: () => fetchCatalogMock(),
}));
vi.mock('../services/progressService', () => ({
  enterBook: (bookId: string) => enterBookMock(bookId),
}));

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>
  );
}

const linkNames = (region: HTMLElement) =>
  within(region)
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label'));

beforeEach(() => {
  fetchCatalogMock.mockReset();
  enterBookMock.mockReset();
  fetchCatalogMock.mockResolvedValue({ books: mockCatalog });
});

test('FR-BRW-001: 신작 줄은 검수된 모든 작품을 등록 최신순으로 보여 준다', async () => {
  renderHome();

  const row = await screen.findByRole('region', { name: '신작' });
  expect(linkNames(row)).toEqual(['다 읽은 책', '읽지 않은 책', '탁류']);
});

const UNREADY_LATEST: BookSummary = {
  book_id: 'unready-latest',
  title: '미검수 신간',
  author: '시험 작가',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: false,
  genre: '시험장르',
  registered_at: '2026-12-01T00:00:00.000Z',
  progress: { current_page: 5, percent: 10, is_complete: false, last_read_at: '2026-12-01T00:00:00.000Z' },
};

test('FR-BRW-002 🚦: 미검수 도서는 이어 읽기·신작·장르 줄 어디에도 0권이고 검수된 도서는 그대로 보인다', async () => {
  fetchCatalogMock.mockResolvedValue({ books: [...mockCatalog, UNREADY_LATEST] });
  renderHome();

  const newest = await screen.findByRole('region', { name: '신작' });
  expect(screen.queryAllByRole('link', { name: /미검수 신간|검수 전 도서/ })).toEqual([]);
  expect(screen.queryByText('미검수 신간')).not.toBeInTheDocument();
  expect(linkNames(newest)).toEqual(['다 읽은 책', '읽지 않은 책', '탁류']);
  expect(within(screen.getByRole('region', { name: '이어 읽기' })).getByRole('link', { name: '탁류' })).toBeInTheDocument();
  expect(linkNames(screen.getByRole('region', { name: '애정소설' }))).toEqual(['다 읽은 책']);
});

test('FR-BRW-002 🚦: 미검수 도서만 있던 장르는 줄째로 사라진다', async () => {
  fetchCatalogMock.mockResolvedValue({ books: [...mockCatalog, UNREADY_LATEST] });
  renderHome();

  await screen.findByRole('region', { name: '신작' });
  expect(screen.queryByRole('region', { name: '시험장르' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['신작', '애정소설']);
});

test('FR-BRW-002 🚦: 같은 장르에 검수된 도서가 있으면 그 장르 줄은 남고 검수된 도서만 보인다', async () => {
  const readySameGenre: BookSummary = { ...mockCatalog[2], genre: '시험장르' };
  fetchCatalogMock.mockResolvedValue({
    books: [mockCatalog[0], mockCatalog[1], readySameGenre, mockCatalog[3], UNREADY_LATEST],
  });
  renderHome();

  const row = await screen.findByRole('region', { name: '시험장르' });
  expect(linkNames(row)).toEqual(['읽지 않은 책']);
});

test('FR-BRW-001: 장르가 있는 책은 그 장르 줄에도 보인다', async () => {
  renderHome();

  const row = await screen.findByRole('region', { name: '애정소설' });
  expect(linkNames(row)).toEqual(['다 읽은 책']);
});

test('FR-BRW-001: 장르가 비어 있는 책은 장르 줄에 없고 신작 줄에는 있다', async () => {
  renderHome();

  const newest = await screen.findByRole('region', { name: '신작' });
  expect(within(newest).getByRole('link', { name: '탁류' })).toBeInTheDocument();
  const genre = screen.getByRole('region', { name: '애정소설' });
  expect(within(genre).queryByRole('link', { name: '탁류' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    '신작',
    '애정소설',
  ]);
});

test('FR-BRW-001: 장르가 있는 책이 없으면 장르 영역 없이 신작 줄만 보인다', async () => {
  const noGenre: BookSummary[] = mockCatalog.map((book) => ({ ...book, genre: null }));
  fetchCatalogMock.mockResolvedValue({ books: noGenre });
  renderHome();

  await screen.findByRole('region', { name: '신작' });
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['신작']);
});

test('FR-BRW-001: 표지를 누르면 작품 페이지로 간다', async () => {
  renderHome();

  const newest = await screen.findByRole('region', { name: '신작' });
  const link = within(newest).getByRole('link', { name: '탁류' });
  expect(link).toHaveAttribute('href', '/books/takryu');
  await userEvent.click(link);
  expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu');
});

test('FR-BRF-005: 이어 읽기 줄의 퍼센트는 서버가 준 값을 그대로 보여 준다', async () => {
  renderHome();

  const strip = await screen.findByRole('region', { name: '이어 읽기' });
  expect(within(strip).getByText('70%')).toBeInTheDocument();
});

test('FR-BRF-005: 퍼센트는 현재 쪽에서 다시 계산하지 않고 서버 값 그대로다', async () => {
  const [takryu, ...rest] = mockCatalog;
  fetchCatalogMock.mockResolvedValue({
    books: [{ ...takryu, progress: { ...takryu.progress!, current_page: 21, percent: 37.5 } }, ...rest],
  });
  renderHome();

  const strip = await screen.findByRole('region', { name: '이어 읽기' });
  expect(within(strip).getByText('37.5%')).toBeInTheDocument();
  expect(within(strip).queryByText('70%')).not.toBeInTheDocument();
});

test('이어 읽기 줄에는 가장 최근에 읽은 책이 뜬다', async () => {
  renderHome();

  const strip = await screen.findByRole('region', { name: '이어 읽기' });
  expect(within(strip).getAllByText('탁류').length).toBeGreaterThan(0);
  expect(within(strip).queryAllByText('다 읽은 책')).toHaveLength(0);
});

test('이어 읽기 줄과 줄 제목에 날짜를 찍지 않는다', async () => {
  renderHome();

  await screen.findByRole('region', { name: '이어 읽기' });
  expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
});

test('FR-BRF-001: 이어 읽기 버튼은 진입 요청을 한 번 보내고 서버가 정한 주소로 간다', async () => {
  enterBookMock.mockResolvedValue({ route: 'briefing', page: 21, is_new_session: true, session_epoch: 3 });
  renderHome();

  const strip = await screen.findByRole('region', { name: '이어 읽기' });
  await userEvent.click(within(strip).getByRole('button', { name: '이어서 읽기' }));

  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/briefing')
  );
  expect(enterBookMock).toHaveBeenCalledTimes(1);
  expect(enterBookMock).toHaveBeenCalledWith('takryu');
});

test('FR-BRW-001: 이어 읽기 줄의 표지와 제목을 누르면 작품 페이지로 가고 진입 요청은 보내지 않는다', async () => {
  renderHome();

  const strip = await screen.findByRole('region', { name: '이어 읽기' });
  const link = within(strip).getByRole('link', { name: '탁류' });
  expect(link).toHaveAttribute('href', '/books/takryu');
  expect(within(link).getAllByText('탁류').length).toBeGreaterThan(0);
  await userEvent.click(link);

  expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu');
  expect(enterBookMock).not.toHaveBeenCalled();
});

test('이어 읽기 버튼은 임의 색 값 없이 색 토큰만 쓴다', async () => {
  renderHome();

  const strip = await screen.findByRole('region', { name: '이어 읽기' });
  const button = within(strip).getByRole('button', { name: '이어서 읽기' });
  expect(button.className).not.toMatch(/rgba?\(|\[#/);
});

test('FR-BRF-001: 서버가 reader라 하면 읽기 주소로 간다', async () => {
  enterBookMock.mockResolvedValue({ route: 'reader', page: 21, is_new_session: false, session_epoch: 3 });
  renderHome();

  const strip = await screen.findByRole('region', { name: '이어 읽기' });
  await userEvent.click(within(strip).getByRole('button', { name: '이어서 읽기' }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/read'));
});

test('FR-SPL-005: 진입 요청이 실패하면 이동하지 않고 안내를 보여 준다', async () => {
  enterBookMock.mockRejectedValue(new Error('network'));
  renderHome();

  const strip = await screen.findByRole('region', { name: '이어 읽기' });
  await userEvent.click(within(strip).getByRole('button', { name: '이어서 읽기' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('열지 못했습니다. 다시 시도해 주세요.');
  expect(screen.queryByTestId('location')).not.toBeInTheDocument();
});

test('진도가 있는 책이 없으면 이어 읽기 줄이 없다', async () => {
  fetchCatalogMock.mockResolvedValue({
    books: mockCatalog.filter((book) => !book.progress),
  });
  renderHome();

  await screen.findByRole('region', { name: '신작' });
  expect(screen.queryByRole('region', { name: '이어 읽기' })).not.toBeInTheDocument();
});

test('FR-SPL-005: 목록을 못 불러오면 안내와 다시 시도 버튼을 보여 준다', async () => {
  fetchCatalogMock.mockRejectedValueOnce(new Error('network'));
  renderHome();

  expect(await screen.findByText('작품을 불러오지 못했습니다')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '신작' })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

  expect(await screen.findByRole('region', { name: '신작' })).toBeInTheDocument();
  expect(fetchCatalogMock).toHaveBeenCalledTimes(2);
});

test('불러오는 동안 불러오는 중 표시가 보인다', () => {
  fetchCatalogMock.mockReturnValue(new Promise(() => {}));
  renderHome();

  expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
  expect(screen.queryByRole('region', { name: '신작' })).not.toBeInTheDocument();
});
