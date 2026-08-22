import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { BookSummary } from '../types';

/**
 * 도서 선택 중 상태 (critique P1, 2026-08-22).
 *
 * 이전에는 `handleSelect` 가 `await enterBook(...)` 하는 동안 화면이 아무 변화도 없었고
 * 진행 중 잠금도 없었다. 태블릿에서 탭이 먹혔는지 알 수 없어 다시 누르게 되는데,
 * `enterBook` 은 `resetSeq()` 를 부르고 서버 세션 판정을 다시 돌리는 호출이라
 * 중복 발신이 무해하지 않다.
 *
 * 이 테스트는 진행 중 promise 를 일부러 해소하지 않고 붙잡아 둔다 — 그래야
 * "왕복이 끝나기 전"의 상태를 검사할 수 있다.
 */
const book: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  progress: { current_page: 80, percent: 64 },
};

let enterCalls = 0;

vi.mock('../services/bookService', () => ({
  fetchCatalog: async () => ({ books: [book] }),
}));
vi.mock('../services/progressService', () => ({
  enterBook: () => {
    enterCalls += 1;
    return new Promise(() => {}); // 해소하지 않는다 — 진행 중 상태에 머문다
  },
}));

describe('Dashboard — 도서 선택 중', () => {
  beforeEach(() => {
    enterCalls = 0;
  });

  it('진입 왕복 중에는 카드가 잠기고, 연타해도 진입 요청이 한 번만 나간다', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    const card = await screen.findByRole('button', { name: /탁류/ });
    await userEvent.click(card);

    expect(enterCalls).toBe(1);
    expect(screen.getByRole('button', { name: /탁류/ })).toBeDisabled();

    // 두 번째 탭 — 잠겨 있으므로 요청이 늘면 안 된다
    await userEvent.click(screen.getByRole('button', { name: /탁류/ }));
    expect(enterCalls).toBe(1);
  });

  it('진입 왕복 중임을 화면에 알린다', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await userEvent.click(await screen.findByRole('button', { name: /탁류/ }));

    expect(screen.getByRole('status')).toHaveTextContent('책을 여는 중');
  });
});
