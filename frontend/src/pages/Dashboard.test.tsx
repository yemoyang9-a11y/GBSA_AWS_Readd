import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { BookSummary } from '../types';

const reading: BookSummary = {
  book_id: 'takryu', title: '탁류', author: '채만식', cover_url: '',
  intro_summary: null, ssabi_ready: true, progress: { current_page: 72, percent: 25.3 },
};
const unread: BookSummary = {
  book_id: 'other', title: '다른 책', author: '아무개', cover_url: '',
  intro_summary: null, ssabi_ready: true,
};

const fetchCatalogMock = vi.fn(async () => ({ books: [reading, unread] }));

vi.mock('../services/bookService', () => ({
  fetchCatalog: () => fetchCatalogMock(),
}));
vi.mock('../services/progressService', () => ({
  enterBook: async () => ({ route: 'briefing', page: 1, is_new_session: true, session_epoch: 1 }),
}));

function renderDashboard() {
  return render(<MemoryRouter><Dashboard /></MemoryRouter>);
}

describe('Dashboard', () => {
  beforeEach(() => {
    fetchCatalogMock.mockReset();
    fetchCatalogMock.mockResolvedValue({ books: [reading, unread] });
  });

  it('첫 번째 책이 기본 히어로로 뜬다', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();
    // 서재 목록 행도 같은 진도 문구를 보여주므로(2권 이상) 두 곳에 나온다
    expect(screen.getAllByText('25.3% 완료').length).toBeGreaterThan(0);
  });

  it('목록 행을 클릭하면 이동 없이 히어로 미리보기만 바뀐다', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    await userEvent.click(screen.getByRole('button', { name: '다른 책 선택' }));

    expect(screen.getByRole('heading', { level: 2, name: '다른 책' })).toBeInTheDocument();
    expect(screen.getByText('새로 시작하기')).toBeInTheDocument();
    // 이동하지 않았다 — 진입 API 를 부르지 않았으므로 여전히 대시보드
    expect(screen.getByText('내 서재')).toBeInTheDocument();
  });

  it('필터 탭은 클라이언트 필터다 — 목록에만 적용되고 히어로는 그대로다 (스펙 §7 #2)', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    await userEvent.click(screen.getByRole('button', { name: '읽는 중' }));
    expect(screen.getByRole('button', { name: /탁류 선택/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다른 책 선택/ })).not.toBeInTheDocument();
    // 히어로는 필터와 무관 — 여전히 탁류
    expect(screen.getByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();
  });

  it('완독 필터는 데이터가 없어 비지만, 백지 대신 그 이유를 말한다', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });
    await userEvent.click(screen.getByRole('button', { name: '완독' }));
    expect(screen.getByText('완독 여부를 판정할 데이터가 아직 없습니다')).toBeInTheDocument();
  });

  it('실제 도서가 1권뿐이어도 데모 항목 덕분에 서재 목록이 보인다 (2026-08-23 사용자 요청)', async () => {
    fetchCatalogMock.mockResolvedValue({ books: [reading] });
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });
    expect(screen.getByText('내 서재')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /데미안 선택/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /파친코 선택/ })).toBeInTheDocument();
  });

  it('데모 항목을 미리보면 히어로는 바뀌지만 이어서 읽기는 막힌다 (2026-08-23 사용자 요청)', async () => {
    fetchCatalogMock.mockResolvedValue({ books: [reading] });
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    await userEvent.click(screen.getByRole('button', { name: /데미안 선택/ }));

    expect(screen.getByRole('heading', { level: 2, name: '데미안' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이어서 읽기' })).toBeDisabled();
  });

  it('실제 도서(탁류)는 데모 항목과 함께 있어도 이어서 읽기가 된다', async () => {
    fetchCatalogMock.mockResolvedValue({ books: [reading] });
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });
    expect(screen.getByRole('button', { name: '이어서 읽기' })).toBeEnabled();
  });
});
