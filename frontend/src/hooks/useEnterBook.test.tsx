import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useEnterBook } from './useEnterBook';
import type { EntryResponse } from '../types';

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
