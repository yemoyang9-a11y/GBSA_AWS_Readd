import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, type NavigateOptions, type To } from 'react-router-dom';
import { useBriefingSession } from './useBriefingSession';

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

vi.mock('../services/recapService', () => ({
  fetchBriefing: () => new Promise(() => {}),
  streamRecap: async function* () {},
}));
vi.mock('../services/ssabiService', () => ({ fetchGraph: () => new Promise(() => {}) }));
vi.mock('../services/progressService', () => ({ sendProgress: vi.fn() }));
vi.mock('../services/bookService', () => ({ fetchBookInfo: () => new Promise(() => {}) }));

function Probe() {
  const session = useBriefingSession('takryu');
  const location = useLocation();
  return (
    <div>
      <button type="button" onClick={session.goBack}>
        돌아가기
      </button>
      <p data-testid="location">{location.pathname}</p>
    </div>
  );
}

function renderProbe() {
  render(
    <MemoryRouter initialEntries={['/books/takryu/briefing']}>
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
});

afterEach(() => {
  Object.defineProperty(window, 'screen', { configurable: true, value: originalScreen });
});

// FR-BRF-001
test('돌아가기는 작품 페이지로 간다', async () => {
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '돌아가기' }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu'));
  expect(screen.getByTestId('location').textContent).toBe('/books/takryu');
});

test('돌아가기는 홈(/)으로 가지 않는다', async () => {
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '돌아가기' }));

  expect(navigateCalls.map((c) => c.to)).not.toContain('/');
});

test('PC 화면의 돌아가기는 화면 전환 효과를 쓴다', async () => {
  setScreen(1440, 1000);
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '돌아가기' }));

  expect(navigateCalls).toEqual([{ to: '/books/takryu', options: { viewTransition: true } }]);
});

test('모바일 화면의 돌아가기는 화면 전환 효과 없이 간다', async () => {
  setScreen(375, 812);
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '돌아가기' }));

  expect(navigateCalls).toHaveLength(1);
  expect(navigateCalls[0].to).toBe('/books/takryu');
  expect(navigateCalls[0].options?.viewTransition).toBeFalsy();
});
