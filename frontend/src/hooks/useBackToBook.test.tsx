import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  type NavigateOptions,
  type To,
} from 'react-router-dom';
import { useBackToBook } from './useBackToBook';

const navigateCalls: { to: To | number; options?: NavigateOptions }[] = [];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => {
      const navigate = actual.useNavigate();
      return (to: To, options?: NavigateOptions) => {
        navigateCalls.push({ to, options });
        return navigate(to, options);
      };
    },
  };
});

const originalScreen = window.screen;

beforeEach(() => {
  navigateCalls.length = 0;
});

afterEach(() => {
  Object.defineProperty(window, 'screen', { configurable: true, value: originalScreen });
});

function Back() {
  const back = useBackToBook('takryu');
  return (
    <button type="button" onClick={back}>
      뒤로 가기
    </button>
  );
}

function Here({ name }: { name: string }) {
  const location = useLocation();
  return <p data-testid="here">{`${name} ${location.pathname}`}</p>;
}

function renderAt(entries: { pathname: string; state?: unknown }[]) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Here name="홈" /> },
      { path: '/shelf', element: <Here name="서재" /> },
      { path: '/books/:bookId', element: <Here name="작품" /> },
      { path: '/books/:bookId/read', element: <Back /> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 }
  );
  render(<RouterProvider router={router} />);
  return router;
}

test('작품 페이지에서 들어왔으면 뒤로 가기는 그 작품 페이지 기록으로 돌아간다', async () => {
  const router = renderAt([
    { pathname: '/shelf' },
    { pathname: '/books/takryu' },
    { pathname: '/books/takryu/read', state: { fromBook: true } },
  ]);

  await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));

  await waitFor(() => expect(screen.getByTestId('here')).toHaveTextContent('작품 /books/takryu'));
  router.navigate(-1);
  await waitFor(() => expect(screen.getByTestId('here')).toHaveTextContent('서재 /shelf'));
});

test('작품 페이지를 거치지 않고 들어왔으면 뒤로 가기는 읽기 기록을 작품 페이지로 바꾼다', async () => {
  const router = renderAt([{ pathname: '/' }, { pathname: '/books/takryu/read' }]);

  await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));

  await waitFor(() => expect(screen.getByTestId('here')).toHaveTextContent('작품 /books/takryu'));
  router.navigate(-1);
  await waitFor(() => expect(screen.getByTestId('here')).toHaveTextContent('홈 /'));
});

test('표시가 없으면 방문 기록이 하나뿐이어도 작품 페이지로 간다', async () => {
  renderAt([{ pathname: '/books/takryu/read' }]);

  await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));

  await waitFor(() => expect(screen.getByTestId('here')).toHaveTextContent('작품 /books/takryu'));
});

test('fromBook 표시가 true가 아니면 작품 페이지 표시로 보지 않는다', async () => {
  const router = renderAt([
    { pathname: '/' },
    { pathname: '/books/takryu/read', state: { fromBook: 'yes', page: 58 } },
  ]);

  await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));

  await waitFor(() => expect(screen.getByTestId('here')).toHaveTextContent('작품 /books/takryu'));
  router.navigate(-1);
  await waitFor(() => expect(screen.getByTestId('here')).toHaveTextContent('홈 /'));
});

test.each([
  ['PC', 1440, 1000],
  ['모바일', 375, 812],
])('%s 화면의 뒤로 가기는 화면 전환 옵션 없이 작품 페이지로 바꾼다', async (_label, width, height) => {
  Object.defineProperty(window, 'screen', { configurable: true, value: { width, height } });
  renderAt([{ pathname: '/' }, { pathname: '/books/takryu/read' }]);

  await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));

  await waitFor(() => expect(screen.getByTestId('here')).toHaveTextContent('작품 /books/takryu'));
  expect(navigateCalls).toEqual([{ to: '/books/takryu', options: { replace: true } }]);
});
