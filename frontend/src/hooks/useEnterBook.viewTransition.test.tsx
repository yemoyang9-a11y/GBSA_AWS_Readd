import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  type NavigateOptions,
  type To,
} from 'react-router-dom';
import { useEnterBook } from './useEnterBook';
import type { EntryResponse } from '../types';
import { setAuthToken } from '../utils/storage';

beforeEach(() => setAuthToken('test-member'));

const enterBookMock = vi.hoisted(() => vi.fn<(bookId: string) => Promise<EntryResponse>>());
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

vi.mock('../services/progressService', () => ({
  enterBook: (bookId: string) => enterBookMock(bookId),
}));

function Probe() {
  const { enter } = useEnterBook();
  const location = useLocation();
  return (
    <div>
      <button type="button" onClick={() => void enter('takryu')}>
        들어가기
      </button>
      <p data-testid="location">{location.pathname}</p>
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

const originalScreen = window.screen;

function setScreen(width: number, height: number) {
  Object.defineProperty(window, 'screen', { configurable: true, value: { width, height } });
}

beforeEach(() => {
  navigateCalls.length = 0;
  enterBookMock.mockReset();
  enterBookMock.mockResolvedValue({
    route: 'briefing',
    page: 21,
    is_new_session: true,
    session_epoch: 3,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'screen', { configurable: true, value: originalScreen });
});

test('모바일에서 책에 들어갈 때는 viewTransition을 쓰지 않는다', async () => {
  setScreen(390, 844);
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/briefing')
  );
  expect(navigateCalls).toHaveLength(1);
  expect(navigateCalls[0].options?.viewTransition).toBeFalsy();
});

test('PC에서도 책에 들어갈 때는 viewTransition을 쓰지 않는다', async () => {
  setScreen(1366, 1024);
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/briefing')
  );
  expect(navigateCalls).toHaveLength(1);
  expect(navigateCalls[0].options?.viewTransition).toBeFalsy();
});

function renderProbeAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  );
}

test('작품 페이지에서 들어가면 fromBook 표시 하나만 넘긴다', async () => {
  renderProbeAt('/books/takryu');

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  await waitFor(() => expect(navigateCalls).toHaveLength(1));
  expect(navigateCalls[0].options?.state).toEqual({ fromBook: true });
});

test('작품 페이지가 아닌 곳에서 들어가면 표시를 넘기지 않는다', async () => {
  renderProbeAt('/');

  await userEvent.click(screen.getByRole('button', { name: '들어가기' }));

  await waitFor(() => expect(navigateCalls).toHaveLength(1));
  expect(navigateCalls[0].options?.state).toBeUndefined();
});
