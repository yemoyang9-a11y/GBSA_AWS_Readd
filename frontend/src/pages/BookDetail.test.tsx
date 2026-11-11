import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import {
  createBrowserRouter,
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import BookDetail from './BookDetail';
import ChapterList from '../components/BookDetail/ChapterList';
import { clearPendingJump, setPendingJump, takePendingJump } from '../utils/pendingJump';
import type { PositionResponse } from '../services/positionService';
import type { BookInfoResponse, BookSummary, CatalogResponse, EntryResponse } from '../types';

const fetchCatalogMock = vi.fn<() => Promise<CatalogResponse>>();
const fetchBookInfoMock = vi.fn<(bookId: string) => Promise<BookInfoResponse>>();
const fetchPositionMock = vi.fn<(...args: unknown[]) => Promise<PositionResponse>>();
const enterBookMock = vi.fn<(bookId: string) => Promise<EntryResponse>>();
const sendProgressMock = vi.fn<(...args: unknown[]) => Promise<number | null>>();

vi.mock('../services/bookService', () => ({
  fetchCatalog: () => fetchCatalogMock(),
  fetchBookInfo: (bookId: string) => fetchBookInfoMock(bookId),
}));
vi.mock('../services/positionService', () => ({
  fetchPosition: (...args: unknown[]) => fetchPositionMock(...args),
}));
vi.mock('../services/progressService', () => ({
  enterBook: (bookId: string) => enterBookMock(bookId),
  sendProgress: (...args: unknown[]) => sendProgressMock(...args),
  sendHeartbeat: vi.fn(),
}));

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
const UNREAD: BookSummary = {
  book_id: 'unread-book',
  title: '읽지 않은 책',
  author: '시험 작가',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  genre: null,
  registered_at: '2026-11-01T00:00:00.000Z',
};
const DONE: BookSummary = {
  ...UNREAD,
  book_id: 'done-book',
  title: '다 읽은 책',
  genre: '애정소설',
  progress: { current_page: 20, percent: 100, is_complete: true, last_read_at: '2026-11-05T00:00:00.000Z' },
};
const NOT_READY: BookSummary = {
  ...UNREAD,
  book_id: 'not-ready-book',
  title: '검수 전 도서',
  author: '미상',
  ssabi_ready: false,
};

const TAKRYU_INFO: BookInfoResponse = {
  basic_info: { title: '탁류', author: '채만식', published_year: 1937, length_note: '411페이지' },
  introduction: '탁류의 소개 문단.',
  background: '첫째 배경 지식.\n\n둘째 배경 지식.',
  chapters: [
    { chapter_no: 1, title: '인간기념물', start_page: 1, end_page: 10 },
    { chapter_no: 2, title: '생활 제일과', start_page: 11, end_page: 20 },
    { chapter_no: 3, title: '신판 흥부전', start_page: 21, end_page: 30 },
    { chapter_no: 4, title: '생애는 방안지라', start_page: 31, end_page: 40 },
  ],
};
const TWO_CHAPTER_INFO: BookInfoResponse = {
  basic_info: { title: '시험', author: '시험 작가', published_year: 2026, length_note: '20페이지' },
  introduction: '시험 책 소개.',
  background: '시험 배경 하나.\n\n시험 배경 둘.\n\n시험 배경 셋.',
  chapters: [
    { chapter_no: 1, title: '첫째 장', start_page: 1, end_page: 10 },
    { chapter_no: 2, title: '둘째 장', start_page: 11, end_page: 20 },
  ],
};

const POSITIONS: Record<string, PositionResponse> = {
  takryu: { applied_cutoff: 21, current_chapter_no: 3, read_chapter_nos: [1, 2], is_complete: false },
  'unread-book': { applied_cutoff: 0, current_chapter_no: null, read_chapter_nos: [], is_complete: false },
  'done-book': { applied_cutoff: 20, current_chapter_no: 2, read_chapter_nos: [1, 2], is_complete: true },
};

function httpError(status: number) {
  return new AxiosError('fail', 'ERR_BAD_REQUEST', undefined, null, { status } as AxiosResponse);
}

function entry(route: EntryResponse['route']): EntryResponse {
  return { route, page: 21, is_new_session: route === 'briefing', session_epoch: 2 };
}

function LocationProbe({ name }: { name: string }) {
  const location = useLocation();
  return <p data-testid="probe">{`${name} ${location.pathname}`}</p>;
}

const ROUTES = [
  { path: '/', element: <LocationProbe name="홈" /> },
  { path: '/books/:bookId', element: <BookDetail /> },
  { path: '/books/:bookId/briefing', element: <LocationProbe name="브리핑" /> },
  { path: '/books/:bookId/read', element: <LocationProbe name="읽기" /> },
];

function renderAt(bookId: string, initialEntries: string[] = [`/books/${bookId}`]) {
  const router = createMemoryRouter(ROUTES, { initialEntries, initialIndex: initialEntries.length - 1 });
  return render(<RouterProvider router={router} />);
}

function chapterRow(title: string) {
  return screen.getByRole('button', { name: new RegExp(title) });
}

function chapterRows() {
  return within(screen.getByRole('list', { name: '목차' })).getAllByRole('button');
}

async function waitForChapters(firstTitle: string) {
  await screen.findByRole('button', { name: new RegExp(firstTitle) });
}

async function flushPosition() {
  await waitFor(() => expect(fetchPositionMock).toHaveBeenCalled());
  await act(async () => {});
}

beforeEach(() => {
  clearPendingJump();
  fetchCatalogMock.mockReset();
  fetchBookInfoMock.mockReset();
  fetchPositionMock.mockReset();
  enterBookMock.mockReset();
  sendProgressMock.mockReset();
  fetchCatalogMock.mockResolvedValue({ books: [TAKRYU, NOT_READY, UNREAD, DONE] });
  fetchBookInfoMock.mockImplementation(async (bookId) =>
    bookId === 'takryu' ? TAKRYU_INFO : TWO_CHAPTER_INFO
  );
  fetchPositionMock.mockImplementation(async (bookId) => POSITIONS[bookId as string]);
  enterBookMock.mockResolvedValue(entry('briefing'));
  sendProgressMock.mockResolvedValue(21);
});

test('FR-BRW-003: 제목·저자·서버가 준 퍼센트를 보여 준다', async () => {
  renderAt('takryu');

  expect(await screen.findByRole('heading', { level: 1, name: '탁류' })).toBeInTheDocument();
  expect(screen.getByText('채만식 지음')).toBeInTheDocument();
  expect(screen.getByText('12.2%')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '12.2');
});

test('장르가 있으면 보여 주고 진도가 없으면 진도 막대가 없다', async () => {
  renderAt('done-book');
  expect(await screen.findByText('애정소설')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
});

test('진도가 없는 책에는 진도 막대가 없다', async () => {
  renderAt('unread-book');
  await screen.findByRole('heading', { level: 1, name: '읽지 않은 책' });
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

test('FR-NAV-001: 목차 탭은 모든 장을 보여 준다', async () => {
  renderAt('takryu');
  await waitForChapters('인간기념물');

  expect(screen.getByRole('tab', { name: '목차' })).toHaveAttribute('aria-selected', 'true');
  expect(chapterRows()).toHaveLength(4);
  expect(chapterRow('생애는 방안지라')).toHaveTextContent('31p');
  expect(chapterRow('신판 흥부전')).toHaveTextContent('21p');
});

test('FR-SPL-002: read_chapter_nos가 [1]이면 2장 이후에는 읽음 표시가 0건이다', async () => {
  fetchPositionMock.mockResolvedValue({
    applied_cutoff: 15,
    current_chapter_no: 2,
    read_chapter_nos: [1],
    is_complete: false,
  });
  renderAt('takryu');
  await waitForChapters('인간기념물');
  await waitFor(() => expect(chapterRow('생활 제일과')).toHaveAttribute('aria-current', 'true'));

  expect(within(chapterRow('인간기념물')).getByText('읽음')).toBeInTheDocument();
  for (const title of ['생활 제일과', '신판 흥부전', '생애는 방안지라']) {
    expect(within(chapterRow(title)).queryByText('읽음')).not.toBeInTheDocument();
  }
});

test('FR-SPL-002: read_chapter_nos가 [1,2,3]이면 1·2·3장에 읽음 표시가 있다', async () => {
  fetchPositionMock.mockResolvedValue({
    applied_cutoff: 35,
    current_chapter_no: 4,
    read_chapter_nos: [1, 2, 3],
    is_complete: false,
  });
  renderAt('takryu');
  await waitForChapters('인간기념물');
  await waitFor(() => expect(chapterRow('생애는 방안지라')).toHaveAttribute('aria-current', 'true'));

  for (const title of ['인간기념물', '생활 제일과', '신판 흥부전']) {
    expect(within(chapterRow(title)).getByText('읽음')).toBeInTheDocument();
  }
  expect(within(chapterRow('생애는 방안지라')).queryByText('읽음')).not.toBeInTheDocument();
});

test('FR-SPL-002: 읽음 표시는 서버 응답으로만 정해진다 — current_page가 뒤쪽이어도 read_chapter_nos가 비면 0건이다', async () => {
  fetchCatalogMock.mockResolvedValue({
    books: [{ ...TAKRYU, progress: { ...TAKRYU.progress!, current_page: 39, percent: 97.5 } }],
  });
  fetchPositionMock.mockResolvedValue({
    applied_cutoff: 39,
    current_chapter_no: null,
    read_chapter_nos: [],
    is_complete: false,
  });
  renderAt('takryu');
  await waitForChapters('인간기념물');
  await screen.findByText('아모가 39쪽까지 줄거리를 정리해 뒀어요');

  for (const row of chapterRows()) {
    expect(within(row).queryByText('읽음')).not.toBeInTheDocument();
    expect(row).not.toHaveAttribute('aria-current');
  }
  expect(screen.queryByText('읽는 중')).not.toBeInTheDocument();
});

test('FR-NAV-001: current_chapter_no인 장 한 곳에만 aria-current가 있다', async () => {
  renderAt('takryu');
  await waitForChapters('인간기념물');
  await waitFor(() => expect(chapterRow('신판 흥부전')).toHaveAttribute('aria-current', 'true'));

  expect(chapterRows().filter((row) => row.hasAttribute('aria-current'))).toHaveLength(1);
  expect(within(chapterRow('신판 흥부전')).getByText('읽는 중')).toBeInTheDocument();
});

test('같은 장이 읽음이면서 현재 장이면 읽는 중만 보이고 읽음은 없다', async () => {
  fetchPositionMock.mockResolvedValue({
    applied_cutoff: 20,
    current_chapter_no: 2,
    read_chapter_nos: [1, 2],
    is_complete: false,
  });
  renderAt('takryu');
  await waitForChapters('인간기념물');
  await waitFor(() => expect(chapterRow('생활 제일과')).toHaveAttribute('aria-current', 'true'));

  const current = chapterRow('생활 제일과');
  expect(within(current).getByText('읽는 중')).toBeInTheDocument();
  expect(within(current).queryByText('읽음')).not.toBeInTheDocument();
  expect(within(chapterRow('인간기념물')).getByText('읽음')).toBeInTheDocument();
  expect(screen.getAllByText('읽는 중')).toHaveLength(1);
});

test('FR-SPL-005: 읽은 장을 못 불러와도 목차는 전부 보이고 읽음·읽는 중 표시만 없다', async () => {
  fetchPositionMock.mockRejectedValue(httpError(500));
  renderAt('takryu');
  await waitForChapters('인간기념물');
  await flushPosition();

  expect(chapterRows()).toHaveLength(4);
  expect(screen.queryByText('읽음')).not.toBeInTheDocument();
  expect(screen.queryByText('읽는 중')).not.toBeInTheDocument();
  for (const row of chapterRows()) expect(row).not.toHaveAttribute('aria-current');
});

test('진도가 없는 책은 aria-current와 읽음 표시가 없고 버튼 문구가 읽기 시작이다', async () => {
  renderAt('unread-book');
  await waitForChapters('첫째 장');
  await flushPosition();

  for (const row of chapterRows()) {
    expect(row).not.toHaveAttribute('aria-current');
    expect(within(row).queryByText('읽음')).not.toBeInTheDocument();
  }
  expect(screen.getByRole('button', { name: '읽기 시작' })).toBeEnabled();
});

test('완독한 책은 현재 장을 뺀 모든 장에 읽음 표시가 있다', async () => {
  renderAt('done-book');
  await waitForChapters('첫째 장');
  await waitFor(() => expect(chapterRow('둘째 장')).toHaveAttribute('aria-current', 'true'));

  expect(within(chapterRow('첫째 장')).getByText('읽음')).toBeInTheDocument();
  expect(within(chapterRow('둘째 장')).queryByText('읽음')).not.toBeInTheDocument();
  expect(within(chapterRow('둘째 장')).getByText('읽는 중')).toBeInTheDocument();
});

test('FR-ADM-005: 준비되지 않은 책에서는 읽은 장을 요청하지 않는다', async () => {
  renderAt('not-ready-book');
  await screen.findByText('아직 준비 중인 작품입니다');
  await act(async () => {});

  expect(fetchPositionMock).not.toHaveBeenCalled();
  expect(fetchBookInfoMock).not.toHaveBeenCalled();
});

test('FR-SPL-002: 읽은 장 요청은 책 id 하나만 보낸다', async () => {
  renderAt('takryu');
  await flushPosition();
  expect(fetchPositionMock.mock.calls).toEqual([['takryu']]);
});

test('FR-BRF-005: 아모 문구의 N은 서버가 준 applied_cutoff다', async () => {
  fetchPositionMock.mockResolvedValue({ ...POSITIONS.takryu, applied_cutoff: 50 });
  renderAt('takryu');

  expect(await screen.findByText('아모가 50쪽까지 줄거리를 정리해 뒀어요')).toBeInTheDocument();
  expect(screen.queryByText(/아모가 21쪽/)).not.toBeInTheDocument();
});

test('FR-BRF-005: applied_cutoff가 0이면 아모 문구를 그리지 않는다', async () => {
  renderAt('unread-book');
  await waitForChapters('첫째 장');
  await flushPosition();

  expect(screen.queryByText(/아모가 .*쪽까지/)).not.toBeInTheDocument();
});

test('FR-SPL-005: 읽은 위치를 못 불러오면 아모 문구를 그리지 않는다', async () => {
  fetchPositionMock.mockRejectedValue(new Error('network'));
  renderAt('takryu');
  await waitForChapters('인간기념물');
  await flushPosition();

  expect(screen.queryByText(/아모가 .*쪽까지/)).not.toBeInTheDocument();
});

test('FR-PRG-003: 장을 누르면 그 장의 start_page를 예약하고 진입 요청을 한 번 보낸다', async () => {
  renderAt('takryu');
  await waitForChapters('인간기념물');

  await userEvent.click(chapterRow('생애는 방안지라'));

  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('브리핑 /books/takryu/briefing'));
  expect(enterBookMock).toHaveBeenCalledTimes(1);
  expect(enterBookMock).toHaveBeenCalledWith('takryu');
  expect(takePendingJump('takryu')).toBe(31);
});

test('FR-PRG-003: 진입이 진행 중일 때 장을 다시 눌러도 진입 요청은 한 번이다', async () => {
  enterBookMock.mockReturnValue(new Promise(() => {}));
  renderAt('takryu');
  await waitForChapters('인간기념물');

  await userEvent.click(chapterRow('생활 제일과'));
  await userEvent.click(chapterRow('생애는 방안지라'));
  await userEvent.click(screen.getByRole('button', { name: '여는 중' }));

  expect(enterBookMock).toHaveBeenCalledTimes(1);
  expect(takePendingJump('takryu')).toBe(11);
});

test('FR-PRG-003: 진입이 실패하면 이동 예약이 지워진다', async () => {
  enterBookMock.mockRejectedValue(new Error('network'));
  renderAt('takryu');
  await waitForChapters('인간기념물');

  await userEvent.click(chapterRow('신판 흥부전'));

  expect(await screen.findByRole('alert')).toHaveTextContent('열지 못했습니다. 다시 시도해 주세요.');
  expect(takePendingJump('takryu')).toBeNull();
});

test('FR-PRG-003: 이 화면은 어느 경우에도 진도 요청을 보내지 않는다', async () => {
  enterBookMock.mockRejectedValue(new Error('network'));
  renderAt('takryu');
  await waitForChapters('인간기념물');

  await userEvent.click(screen.getByRole('tab', { name: '작품 소개' }));
  await userEvent.click(screen.getByRole('tab', { name: '배경 지식' }));
  await userEvent.click(screen.getByRole('tab', { name: '목차' }));
  await userEvent.click(chapterRow('생애는 방안지라'));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));
  await act(async () => {});

  expect(sendProgressMock).not.toHaveBeenCalled();
});

test('FR-PRG-003: 화면이 뜰 때 남아 있던 이동 예약을 지운다', async () => {
  setPendingJump('takryu', 31);
  renderAt('takryu');
  await screen.findByRole('heading', { level: 1, name: '탁류' });

  expect(takePendingJump('takryu')).toBeNull();
});

test('읽기 버튼으로 들어가면 남아 있던 이동 예약이 지워진다', async () => {
  renderAt('takryu');
  await screen.findByRole('heading', { level: 1, name: '탁류' });
  setPendingJump('takryu', 31);

  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('브리핑'));
  expect(takePendingJump('takryu')).toBeNull();
});

test('FR-BGK-002: 배경 지식 탭은 진도와 상관없이 전부 보여 준다', async () => {
  renderAt('unread-book');
  await waitForChapters('첫째 장');

  await userEvent.click(screen.getByRole('tab', { name: '배경 지식' }));

  const panel = screen.getByRole('tabpanel', { name: '배경 지식' });
  expect(within(panel).getByText('시험 배경 하나.')).toBeInTheDocument();
  expect(within(panel).getByText('시험 배경 둘.')).toBeInTheDocument();
  expect(within(panel).getByText('시험 배경 셋.')).toBeInTheDocument();
});

test('작품 소개 탭은 서버가 준 소개를 보여 준다', async () => {
  renderAt('takryu');
  await waitForChapters('인간기념물');

  await userEvent.click(screen.getByRole('tab', { name: '작품 소개' }));

  expect(within(screen.getByRole('tabpanel', { name: '작품 소개' })).getByText('탁류의 소개 문단.')).toBeInTheDocument();
});

test('탭은 좌우 화살표 키로 옮겨진다', async () => {
  renderAt('takryu');
  await waitForChapters('인간기념물');
  const toc = screen.getByRole('tab', { name: '목차' });
  toc.focus();

  await userEvent.keyboard('{ArrowRight}');
  const intro = screen.getByRole('tab', { name: '작품 소개' });
  expect(intro).toHaveAttribute('aria-selected', 'true');
  expect(intro).toHaveFocus();
  expect(screen.getByRole('tabpanel', { name: '작품 소개' })).toBeInTheDocument();

  await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
  const background = screen.getByRole('tab', { name: '배경 지식' });
  expect(background).toHaveAttribute('aria-selected', 'true');
  expect(background).toHaveFocus();
  expect(toc).toHaveAttribute('aria-selected', 'false');
  expect(toc).toHaveAttribute('tabindex', '-1');
});

test('FR-BRF-001: 읽기 버튼은 진입 요청을 한 번 보내고 서버가 정한 주소로 간다', async () => {
  enterBookMock.mockResolvedValue(entry('reader'));
  renderAt('takryu');
  await screen.findByRole('heading', { level: 1, name: '탁류' });

  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('읽기 /books/takryu/read'));
  expect(enterBookMock).toHaveBeenCalledTimes(1);
  expect(enterBookMock).toHaveBeenCalledWith('takryu');
});

test('FR-ADM-005: 준비되지 않은 책은 준비 중 안내를 보여 주고 읽기 버튼과 목차 줄이 비활성이다', async () => {
  renderAt('not-ready-book');

  expect(await screen.findByText('아직 준비 중인 작품입니다')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: '검수 전 도서' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '아직 준비 중입니다' })).toBeDisabled();
  expect(screen.queryAllByRole('button').filter((b) => /\d+p/.test(b.textContent ?? '') && !b.hasAttribute('disabled'))).toEqual([]);
  await userEvent.click(screen.getByRole('button', { name: '아직 준비 중입니다' }));
  expect(enterBookMock).not.toHaveBeenCalled();
});

test('FR-ADM-005: /info가 403이면 준비 중 안내를 보여 주고 읽기 버튼이 비활성이다', async () => {
  fetchBookInfoMock.mockRejectedValue(httpError(403));
  renderAt('takryu');

  expect(await screen.findByText('아직 준비 중인 작품입니다')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이어서 읽기' })).toBeDisabled();
  expect(fetchPositionMock).not.toHaveBeenCalled();
});

test('FR-ADM-005: 목차 줄은 준비되지 않은 책이면 누를 수 없다', async () => {
  const onSelect = vi.fn();
  render(
    <ChapterList chapters={TWO_CHAPTER_INFO.chapters} position={null} disabled onSelect={onSelect} />
  );

  const rows = within(screen.getByRole('list', { name: '목차' })).getAllByRole('button');
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row).toBeDisabled();
  await userEvent.click(rows[0]);
  expect(onSelect).not.toHaveBeenCalled();
});

test('없는 책 주소는 찾을 수 없음 안내와 홈 링크를 보여 준다', async () => {
  renderAt('no-such-book');

  expect(await screen.findByText('찾을 수 없는 작품입니다')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/');
  expect(fetchPositionMock).not.toHaveBeenCalled();
});

test('/info가 404면 찾을 수 없음 안내를 보여 준다', async () => {
  fetchBookInfoMock.mockRejectedValue(httpError(404));
  renderAt('takryu');

  expect(await screen.findByText('찾을 수 없는 작품입니다')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '이어서 읽기' })).not.toBeInTheDocument();
});

test('FR-SPL-005: 책 정보를 못 불러와도 제목과 읽기 버튼은 보인다', async () => {
  fetchBookInfoMock.mockRejectedValueOnce(httpError(500));
  renderAt('takryu');

  expect(await screen.findByText('작품 정보를 불러오지 못했습니다')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: '탁류' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이어서 읽기' })).toBeEnabled();
  expect(fetchPositionMock).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

  await waitForChapters('인간기념물');
  expect(fetchBookInfoMock).toHaveBeenCalledTimes(2);
});

test('FR-SPL-005: 작품 목록을 못 불러오면 안내와 다시 시도 버튼을 보여 준다', async () => {
  fetchCatalogMock.mockRejectedValueOnce(new Error('network'));
  renderAt('takryu');

  expect(await screen.findByText('작품 정보를 불러오지 못했습니다')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

  expect(await screen.findByRole('heading', { level: 1, name: '탁류' })).toBeInTheDocument();
});

test('불러오는 동안 불러오는 중 표시가 보인다', async () => {
  fetchCatalogMock.mockReturnValue(new Promise(() => {}));
  renderAt('takryu');

  expect(screen.getByText('불러오는 중')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '뒤로 가기' })).toBeInTheDocument();
});

test('뒤로 가기는 들어온 화면으로 돌아간다', async () => {
  renderAt('takryu', ['/', '/books/takryu']);
  await screen.findByRole('heading', { level: 1, name: '탁류' });

  await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));

  expect(screen.getByTestId('probe')).toHaveTextContent('홈 /');
});

test('방문 기록이 없으면 뒤로 가기는 홈으로 간다', async () => {
  window.history.replaceState(null, '', '/books/takryu');
  const router = createBrowserRouter(ROUTES);
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1, name: '탁류' });

  await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));

  expect(await screen.findByTestId('probe')).toHaveTextContent('홈 /');
  router.dispose();
  window.history.replaceState(null, '', '/');
});
