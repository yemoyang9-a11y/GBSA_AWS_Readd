import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { BookSummary } from '../types';

const reading: BookSummary = {
  book_id: 'takryu', title: '탁류', author: '채만식', cover_url: '',
  intro_summary: null, ssabi_ready: true, progress: { current_page: 80, percent: 64 },
};
const unread: BookSummary = {
  book_id: 'other', title: '다른 책', author: '아무개', cover_url: '',
  intro_summary: null, ssabi_ready: true,
};

vi.mock('../services/bookService', () => ({
  fetchCatalog: async () => ({ books: [reading, unread] }),
}));
vi.mock('../services/progressService', () => ({
  enterBook: async () => ({ route: 'briefing', page: 1, is_new_session: true, session_epoch: 1 }),
}));

function renderDashboard() {
  return render(<MemoryRouter><Dashboard /></MemoryRouter>);
}

describe('Dashboard', () => {
  it('통계는 카탈로그에서 센다 — 진도가 있으면 읽는 중 (스펙 §7 #1)', async () => {
    renderDashboard();
    // 탁류는 조판 표지·정보 영역 양쪽에 나오므로(BookCard, Task 4) role 로 좁혀서 찾는다
    expect(await screen.findByRole('button', { name: /탁류/ })).toBeInTheDocument();
    // ⚠️ "읽는 중"은 통계 라벨·필터 탭·카드 진도 라벨 세 곳에 나온다.
    //    getByText 로 찾으면 다중 매치로 실패하므로 testid 로 범위를 좁힌다.
    // 읽는 중 1권, 완독은 판정 데이터가 없어 0
    expect(screen.getByTestId('stat-reading')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-reading')).toHaveTextContent('읽는 중');
    expect(screen.getByTestId('stat-done')).toHaveTextContent('0');
  });

  it('필터 탭은 클라이언트 필터다 — "읽는 중"은 진도 있는 책만 남긴다 (스펙 §7 #2)', async () => {
    renderDashboard();
    expect(await screen.findByRole('button', { name: /탁류/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '읽는 중' }));
    expect(screen.getByRole('button', { name: /탁류/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다른 책/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(screen.getByRole('button', { name: /다른 책/ })).toBeInTheDocument();
  });

  it('완독 필터는 데이터가 없어 빈 목록이 된다', async () => {
    renderDashboard();
    expect(await screen.findByRole('button', { name: /탁류/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '완독' }));
    expect(screen.queryByRole('button', { name: /탁류/ })).not.toBeInTheDocument();
  });
});
