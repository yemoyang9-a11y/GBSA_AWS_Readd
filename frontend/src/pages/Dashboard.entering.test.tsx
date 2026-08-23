import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { BookSummary } from '../types';

/**
 * 이어서 읽기 왕복 중 상태 (critique P1, 2026-08-22 — 대시보드 재설계 후에도 유지).
 *
 * `handleResume` 이 `await enterBook(...)` 하는 동안 화면이 아무 변화도 없으면 안 된다.
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

  it('이어서 읽기 왕복 중에는 버튼이 잠기고, 연타해도 진입 요청이 한 번만 나간다', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    const button = await screen.findByRole('button', { name: '이어서 읽기' });
    await userEvent.click(button);

    expect(enterCalls).toBe(1);
    expect(screen.getByRole('button', { name: '여는 중' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '여는 중' }));
    expect(enterCalls).toBe(1);
  });
});
