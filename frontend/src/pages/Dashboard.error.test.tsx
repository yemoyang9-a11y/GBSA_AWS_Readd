import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { BookSummary } from '../types';

/**
 * 카탈로그 조회 실패 (critique P0, 2026-08-22) — 이전에는 `fetchCatalog` 에 `.catch` 가
 * 없어 백엔드 장애 시 "불러오는 중"에서 영원히 멈췄다. 대시보드는 앱의 유일한 진입점이라
 * 복구 수단이 새로고침밖에 없었다. 크리틱 중 백엔드가 실제로 죽어 이 화면이 실측됐다.
 *
 * 읽기 화면은 같은 문제를 이미 고쳐 뒀다 (`Reader.error.test.tsx`).
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

let catalogCalls = 0;

vi.mock('../services/bookService', () => ({
  fetchCatalog: async () => {
    catalogCalls += 1;
    if (catalogCalls === 1) throw new Error('mock catalog failure');
    return { books: [book] };
  },
}));
vi.mock('../services/progressService', () => ({
  enterBook: async () => ({ route: 'briefing', page: 1, is_new_session: true, session_epoch: 1 }),
}));

describe('Dashboard — 카탈로그 조회 실패', () => {
  beforeEach(() => {
    catalogCalls = 0;
  });

  it('조회가 실패하면 무한 로딩 대신 에러+재시도를 보여주고, 재시도하면 복구된다', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('서재를 불러오지 못했습니다');
    // 로딩 표시가 남아 있으면 안 된다 — 그게 원래 버그였다
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByRole('button', { name: /탁류/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
