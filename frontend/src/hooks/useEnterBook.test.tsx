import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { useEnterBook } from './useEnterBook';
import { clearPendingJump, setPendingJump, takePendingJump } from '../utils/pendingJump';
import type { EntryResponse } from '../types';
import { setAuthToken } from '../utils/storage';

beforeEach(() => setAuthToken('test-member'));

const enterBookMock = vi.fn<(bookId: string) => Promise<EntryResponse>>();

vi.mock('../services/progressService', () => ({
  enterBook: (bookId: string) => enterBookMock(bookId),
}));

function entry(route: EntryResponse['route']): EntryResponse {
  return { route, page: 21, is_new_session: route === 'briefing', session_epoch: 3 };
}

function Probe() {
  const { enter, busyId, failed } = useEnterBook();
  const location = useLocation();
  return (
    <div>
      <button type="button" onClick={() => void enter('takryu')}>
        들어가기
      </button>
      <p data-testid="location">{location.pathname}</p>
      <p data-testid="busy">{busyId ?? '-'}</p>
      <p data-testid="failed">{String(failed)}</p>
    </div>
  );
}

function renderProbe() {
  render(
    <MemoryRouter initialEntries={['/books/takryu']}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  enterBookMock.mockReset();
  clearPendingJump();
});

test('FR-BRF-001: enter는 서버가 briefing이라 하면 브리핑 주소로 간다', async () => {
  enterBookMock.mockResolvedValue(entry('briefing'));
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/briefing')
  );
  expect(enterBookMock).toHaveBeenCalledTimes(1);
  expect(enterBookMock).toHaveBeenCalledWith('takryu');
});

test('FR-BRF-001: enter는 서버가 reader라 하면 읽기 주소로 간다', async () => {
  enterBookMock.mockResolvedValue({ ...entry('reader'), is_new_session: true });
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/read'));
  expect(enterBookMock).toHaveBeenCalledTimes(1);
});

test('FR-SPL-005: 진입 요청이 실패하면 이동하지 않고 failed가 true다', async () => {
  enterBookMock.mockRejectedValue(new Error('network'));
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'));
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/books\/takryu$/);
  expect(screen.getByTestId('busy')).toHaveTextContent('-');
});

test('enter 중에는 busyId가 그 책 id다', async () => {
  enterBookMock.mockReturnValue(new Promise(() => {}));
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  expect(screen.getByTestId('busy')).toHaveTextContent('takryu');
  expect(screen.getByTestId('failed')).toHaveTextContent('false');
});

test('FR-BRF-001: enter 중에 다시 불러도 진입 요청은 한 번이다', async () => {
  enterBookMock.mockReturnValue(new Promise(() => {}));
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  expect(enterBookMock).toHaveBeenCalledTimes(1);
});

test('FR-SPL-005: 실패 뒤 다시 시도하면 failed가 풀린다', async () => {
  enterBookMock.mockRejectedValueOnce(new Error('network'));
  enterBookMock.mockReturnValueOnce(new Promise(() => {}));
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'));

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  expect(screen.getByTestId('failed')).toHaveTextContent('false');
  expect(screen.getByTestId('busy')).toHaveTextContent('takryu');
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function DetailProbe() {
  const { bookId = '' } = useParams();
  const { enter, busyId, failed } = useEnterBook();
  const location = useLocation();
  return (
    <div>
      <button type="button" onClick={() => void enter(bookId)}>
        들어가기
      </button>
      <Link to="/books/other">다른 책</Link>
      <Link to="/search">검색</Link>
      <p data-testid="location">{location.pathname}</p>
      <p data-testid="busy">{busyId ?? '-'}</p>
      <p data-testid="failed">{String(failed)}</p>
    </div>
  );
}

function renderDetailRouter() {
  const router = createMemoryRouter(
    [
      { path: '/books/:bookId', element: <DetailProbe /> },
      { path: '/books/:bookId/briefing', element: <p>브리핑</p> },
      { path: '/books/:bookId/read', element: <p>읽기</p> },
      { path: '/search', element: <p>검색 화면</p> },
    ],
    { initialEntries: ['/books/takryu'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

test('FR-BRF-001: 응답 전에 화면을 떠났으면 늦게 온 성공 응답으로 이동하지 않는다', async () => {
  const pending = deferred<EntryResponse>();
  enterBookMock.mockReturnValue(pending.promise);
  const router = renderDetailRouter();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  await userEvent.click(screen.getByRole('link', { name: '검색' }));
  expect(screen.getByText('검색 화면')).toBeInTheDocument();

  await act(async () => pending.resolve(entry('briefing')));

  expect(router.state.location.pathname).toBe('/search');
});

test('FR-SPL-005: 응답 전에 화면을 떠났으면 늦게 온 실패 응답으로 상태를 바꾸지 않는다', async () => {
  const consoleError = vi.spyOn(console, 'error');
  const pending = deferred<EntryResponse>();
  enterBookMock.mockReturnValue(pending.promise);
  const router = renderDetailRouter();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  await userEvent.click(screen.getByRole('link', { name: '검색' }));
  await act(async () => pending.reject(new Error('network')));

  expect(router.state.location.pathname).toBe('/search');
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

test('FR-BRF-001: 같은 화면에서 다른 책으로 옮긴 뒤 앞 책의 늦은 응답은 무시하고 상태도 풀린다', async () => {
  const pending = deferred<EntryResponse>();
  enterBookMock.mockReturnValue(pending.promise);
  const router = renderDetailRouter();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  expect(screen.getByTestId('busy')).toHaveTextContent('takryu');
  await userEvent.click(screen.getByRole('link', { name: '다른 책' }));

  expect(screen.getByTestId('busy')).toHaveTextContent('-');
  await act(async () => pending.resolve(entry('briefing')));
  expect(router.state.location.pathname).toBe('/books/other');
});

test('FR-BRF-001: 더 새로운 진입 요청이 시작되면 앞 요청의 늦은 응답은 무시하고 최신 요청 응답으로 이동한다', async () => {
  const first = deferred<EntryResponse>();
  const second = deferred<EntryResponse>();
  enterBookMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const router = renderDetailRouter();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  await userEvent.click(screen.getByRole('link', { name: '다른 책' }));
  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  expect(enterBookMock).toHaveBeenNthCalledWith(2, 'other');

  await act(async () => first.resolve(entry('briefing')));
  expect(router.state.location.pathname).toBe('/books/other');

  await act(async () => second.resolve(entry('reader')));
  await waitFor(() => expect(router.state.location.pathname).toBe('/books/other/read'));
});

function TwoBookProbe() {
  const { enter } = useEnterBook();
  return (
    <div>
      <button type="button" onClick={() => void enter('takryu')}>
        탁류 들어가기
      </button>
      <button type="button" onClick={() => void enter('other')}>
        다른 책 들어가기
      </button>
    </div>
  );
}

function renderTwoBookRouter() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <TwoBookProbe /> },
      { path: '/books/:bookId/briefing', element: <p>브리핑</p> },
      { path: '/books/:bookId/read', element: <p>읽기</p> },
    ],
    { initialEntries: ['/'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

test('FR-PRG-003: 예약 뒤 응답 전에 화면을 떠나면 이동 예약이 지워지고 늦은 응답도 되살리지 않는다', async () => {
  const pending = deferred<EntryResponse>();
  enterBookMock.mockReturnValue(pending.promise);
  const router = renderDetailRouter();

  setPendingJump('takryu', 31);
  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  await userEvent.click(screen.getByRole('link', { name: '검색' }));
  expect(screen.getByText('검색 화면')).toBeInTheDocument();
  expect(takePendingJump('takryu')).toBeNull();

  await act(async () => pending.resolve(entry('briefing')));

  expect(router.state.location.pathname).toBe('/search');
  expect(takePendingJump('takryu')).toBeNull();
});

test('FR-PRG-003: 예약 뒤 진입에 성공해 이동하면 이동 예약은 그대로 남는다', async () => {
  enterBookMock.mockResolvedValue(entry('briefing'));
  const router = renderDetailRouter();

  setPendingJump('takryu', 31);
  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  await waitFor(() => expect(router.state.location.pathname).toBe('/books/takryu/briefing'));
  expect(screen.getByText('브리핑')).toBeInTheDocument();
  expect(takePendingJump('takryu')).toBe(31);
});

test('FR-PRG-003: 예약 뒤 진입이 실패하면 이동 예약이 지워진다', async () => {
  enterBookMock.mockRejectedValue(new Error('network'));
  renderDetailRouter();

  setPendingJump('takryu', 31);
  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'));
  expect(takePendingJump('takryu')).toBeNull();
});

test('FR-PRG-003: 더 새로운 다른 책 요청에 밀리면 앞 책의 이동 예약이 지워진다', async () => {
  const first = deferred<EntryResponse>();
  const second = deferred<EntryResponse>();
  enterBookMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const router = renderTwoBookRouter();

  setPendingJump('takryu', 31);
  await userEvent.click(screen.getByRole('button', { name: '탁류 들어가기' }));
  await userEvent.click(screen.getByRole('button', { name: '다른 책 들어가기' }));
  await act(async () => first.resolve(entry('briefing')));
  await act(async () => second.resolve(entry('briefing')));

  await waitFor(() => expect(router.state.location.pathname).toBe('/books/other/briefing'));
  expect(takePendingJump('takryu')).toBeNull();
});

test('FR-PRG-003: 더 새로운 다른 책 요청이 자기 이동 예약을 넣었으면 앞 요청의 늦은 실패가 그 예약을 지우지 않는다', async () => {
  const first = deferred<EntryResponse>();
  const second = deferred<EntryResponse>();
  enterBookMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const router = renderTwoBookRouter();

  setPendingJump('takryu', 31);
  await userEvent.click(screen.getByRole('button', { name: '탁류 들어가기' }));
  setPendingJump('other', 5);
  await userEvent.click(screen.getByRole('button', { name: '다른 책 들어가기' }));
  await act(async () => first.reject(new Error('network')));
  await act(async () => second.resolve(entry('briefing')));

  await waitFor(() => expect(router.state.location.pathname).toBe('/books/other/briefing'));
  expect(takePendingJump('other')).toBe(5);
});

test('FR-PRG-003: 화면을 옮겨 다른 책 요청을 시작한 뒤 앞 책의 늦은 응답이 새 이동 예약을 지우지 않는다', async () => {
  const first = deferred<EntryResponse>();
  const second = deferred<EntryResponse>();
  enterBookMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const router = renderDetailRouter();

  setPendingJump('takryu', 31);
  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  await userEvent.click(screen.getByRole('link', { name: '다른 책' }));
  setPendingJump('other', 5);
  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  expect(enterBookMock).toHaveBeenNthCalledWith(2, 'other');

  await act(async () => first.resolve(entry('briefing')));
  await act(async () => second.resolve(entry('reader')));

  await waitFor(() => expect(router.state.location.pathname).toBe('/books/other/read'));
  expect(takePendingJump('other')).toBe(5);
});

async function enterThenBackInOneRender(router: ReturnType<typeof renderDetailRouter>) {
  const pending = deferred<EntryResponse>();
  enterBookMock.mockReturnValue(pending.promise);
  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));
  expect(screen.getByTestId('busy')).toHaveTextContent('takryu');

  await act(async () => {
    pending.resolve(entry('briefing'));
    await pending.promise;
    await Promise.resolve();
    expect(router.state.location.pathname).toBe('/books/takryu/briefing');
    void router.navigate(-1);
    await Promise.resolve();
  });
  expect(router.state.location.pathname).toBe('/books/takryu');
}

test('FR-SPL-005: 브리핑이 그려지기 전에 뒤로 돌아와도 읽기 버튼이 진입 중 상태로 멈추지 않는다', async () => {
  const router = renderDetailRouter();

  await enterThenBackInOneRender(router);

  await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('-'));
  expect(screen.getByTestId('failed')).toHaveTextContent('false');
});

test('FR-PRG-003: 브리핑이 그려지기 전에 뒤로 돌아오면 장 이동 예약이 남지 않는다', async () => {
  const router = renderDetailRouter();
  setPendingJump('takryu', 21);

  await enterThenBackInOneRender(router);

  await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent('-'));
  expect(takePendingJump('takryu')).toBeNull();
});

test('FR-PRG-003: 브리핑이 실제로 열리면 장 이동 예약은 읽기 화면을 위해 남는다', async () => {
  enterBookMock.mockResolvedValue(entry('briefing'));
  renderDetailRouter();
  setPendingJump('takryu', 21);

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  expect(await screen.findByText('브리핑')).toBeInTheDocument();
  expect(takePendingJump('takryu')).toBe(21);
});
