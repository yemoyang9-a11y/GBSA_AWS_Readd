import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, type NavigateOptions, type To } from 'react-router-dom';
import { useBriefingSession } from './useBriefingSession';
import { clearPendingJump, takePendingJump } from '../utils/pendingJump';

const sendProgressMock = vi.hoisted(() => vi.fn());

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
vi.mock('../services/progressService', () => ({ sendProgress: sendProgressMock }));
vi.mock('../services/bookService', () => ({ fetchBookInfo: () => new Promise(() => {}) }));

function Probe() {
  const session = useBriefingSession('takryu');
  const location = useLocation();
  return (
    <div>
      <button type="button" onClick={session.goBack}>
        돌아가기
      </button>
      <button type="button" onClick={() => session.selectChapter(21)}>
        장 고르기
      </button>
      <button type="button" onClick={session.continueReading}>
        이어서 읽기
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
  sendProgressMock.mockReset();
  clearPendingJump();
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

  expect(navigateCalls).toEqual([
    { to: '/books/takryu', options: { replace: true, viewTransition: true } },
  ]);
});

test('모바일 화면의 돌아가기는 화면 전환 효과 없이 간다', async () => {
  setScreen(375, 812);
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '돌아가기' }));

  expect(navigateCalls).toHaveLength(1);
  expect(navigateCalls[0].to).toBe('/books/takryu');
  expect(navigateCalls[0].options?.viewTransition).toBeFalsy();
});

// FR-PRG-003
test('FR-PRG-003: 목차에서 장을 고르면 진도 요청 0건이고 그 장의 start_page가 이동 예약에 담긴다', async () => {
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '장 고르기' }));

  expect(sendProgressMock).toHaveBeenCalledTimes(0);
  expect(takePendingJump('takryu')).toBe(21);
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/read'));
});

// FR-PRG-003
test('FR-PRG-003: 이어서 읽기는 진도 요청도 이동 예약도 만들지 않는다', async () => {
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

  expect(sendProgressMock).toHaveBeenCalledTimes(0);
  expect(takePendingJump('takryu')).toBeNull();
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/read'));
});

test.each(['이어서 읽기', '장 고르기'])('모바일 화면의 %s는 화면 전환 효과 없이 읽기 화면으로 간다', async (button) => {
  setScreen(375, 812);
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: button }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/read'));
  expect(navigateCalls).toHaveLength(1);
  expect(navigateCalls[0].options?.viewTransition).toBeFalsy();
});

test.each(['이어서 읽기', '장 고르기'])('PC 화면의 %s도 화면 전환 효과 없이 읽기 화면으로 간다', async (button) => {
  setScreen(1440, 1000);
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: button }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/read'));
  expect(navigateCalls).toHaveLength(1);
  expect(navigateCalls[0].to).toBe('/books/takryu/read');
  expect(navigateCalls[0].options?.viewTransition).toBeFalsy();
});

function renderProbeWithState(state: unknown) {
  render(
    <MemoryRouter initialEntries={['/books/takryu', { pathname: '/books/takryu/briefing', state }]} initialIndex={1}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  );
}

test.each(['이어서 읽기', '장 고르기'])('%s는 브리핑 기록을 읽기 화면으로 바꾸고 fromBook 표시를 넘긴다', async (button) => {
  renderProbeWithState({ fromBook: true });

  await userEvent.click(screen.getByRole('button', { name: button }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/read'));
  expect(navigateCalls).toEqual([
    { to: '/books/takryu/read', options: { replace: true, state: { fromBook: true } } },
  ]);
});

test('표시 없이 들어온 브리핑의 이어서 읽기는 표시 없이 기록만 바꾼다', async () => {
  renderProbe();

  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu/read'));
  expect(navigateCalls).toEqual([{ to: '/books/takryu/read', options: { replace: true } }]);
});

test('작품 페이지에서 들어온 브리핑의 돌아가기는 그 작품 페이지 기록으로 돌아간다', async () => {
  renderProbeWithState({ fromBook: true });

  await userEvent.click(screen.getByRole('button', { name: '돌아가기' }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu'));
  expect(navigateCalls).toEqual([{ to: -1, options: undefined }]);
});
