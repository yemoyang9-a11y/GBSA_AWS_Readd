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

// 2026-08-25: Dashboard가 히어로 "N쪽"(전체 페이지 수)을 위해 GET /info도 부른다 —
// 총 페이지는 목차 마지막 장 end_page에서 나온다.
vi.mock('../services/bookService', () => ({
  fetchCatalog: () => fetchCatalogMock(),
  fetchBookInfo: async () => ({
    basic_info: { title: '탁류', author: '채만식', published_year: 1937, length_note: '' },
    introduction: '',
    background: '',
    chapters: [{ chapter_no: 1, title: '1장', start_page: 1, end_page: 285 }],
  }),
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

  it('의견 남기기 버튼은 서재 목록 아래 main의 맨 끝에 있고 누르면 모달이 열린다', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    const button = screen.getByRole('button', { name: '의견 남기기' });
    expect(
      screen.getByText('내 서재').compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole('main').lastElementChild).toContainElement(button);

    await userEvent.click(button);

    expect(screen.getByRole('dialog', { name: '의견 남기기' })).toBeInTheDocument();
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

  it('선택된 책이 새 필터에서 걸러지면 히어로도 기본값으로 돌아간다 (2026-08-23 사용자 제보)', async () => {
    fetchCatalogMock.mockResolvedValue({ books: [reading] });
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    // 데미안을 미리본다 — 완독 데이터는 아예 없으므로 어떤 필터에도 안 걸린다
    await userEvent.click(screen.getByRole('button', { name: /데미안 선택/ }));
    expect(screen.getByRole('heading', { level: 2, name: '데미안' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '완독' }));

    expect(screen.getByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();
    expect(screen.getByText('완독 여부를 판정할 데이터가 아직 없습니다')).toBeInTheDocument();
  });

  it('서재 카드의 정보 버튼을 누르면 도서 소개 모달이 뜬다 (2026-08-23)', async () => {
    fetchCatalogMock.mockResolvedValue({ books: [reading] });
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    await userEvent.click(screen.getByRole('button', { name: '데미안 정보 보기' }));

    expect(screen.getByRole('dialog', { name: '데미안' })).toBeInTheDocument();
    expect(screen.getByText('도서 소개')).toBeInTheDocument();
    expect(screen.getByText('배경 지식')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('FR-BRW-001: 순서표에 없는 도서는 서버가 준 순서 그대로 순서표 도서 뒤에 붙는다', async () => {
    const first: BookSummary = {
      book_id: 'unlisted-a', title: '가나다', author: '아무개', cover_url: '',
      intro_summary: null, ssabi_ready: true,
    };
    const second: BookSummary = {
      book_id: 'unlisted-b', title: '하하하', author: '아무개', cover_url: '',
      intro_summary: null, ssabi_ready: true,
    };
    fetchCatalogMock.mockResolvedValue({ books: [second, first, reading] });
    renderDashboard();

    expect(await screen.findByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();
    const shelfOrder = screen
      .getAllByRole('button', { name: / 선택$/ })
      .map((button) => button.getAttribute('aria-label'));
    expect(shelfOrder).toEqual(['탁류 선택', '하하하 선택', '가나다 선택', '데미안 선택', '파친코 선택']);
  });

  it('FR-BRW-001: 서버가 제목순으로 셜록 홈즈를 먼저 줘도 탁류가 첫 히어로이고 서재에서 셜록 홈즈와 자리를 바꾼다 (2026-11-06 사용자 요청)', async () => {
    const sherlock: BookSummary = {
      book_id: 'test-book-2', title: '셜록 홈즈 전집', author: '아서 코난 도일', cover_url: '',
      intro_summary: null, ssabi_ready: false,
    };
    const tonight: BookSummary = {
      book_id: 'test-book-1', title: '오늘 밤, 세계에서 이 사랑이 사라진다 해도', author: '이치조 미사키',
      cover_url: '', intro_summary: null, ssabi_ready: true,
    };
    fetchCatalogMock.mockResolvedValue({ books: [sherlock, tonight, reading] });
    renderDashboard();

    expect(await screen.findByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();
    const shelfOrder = screen
      .getAllByRole('button', { name: / 선택$/ })
      .map((button) => button.getAttribute('aria-label'));
    expect(shelfOrder).toEqual([
      '탁류 선택',
      '오늘 밤, 세계에서 이 사랑이 사라진다 해도 선택',
      '셜록 홈즈 전집 선택',
      '데미안 선택',
      '파친코 선택',
    ]);
  });

  it('선택된 책이 새 필터에서도 여전히 걸리면 히어로를 그대로 둔다', async () => {
    fetchCatalogMock.mockResolvedValue({ books: [reading] });
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    // 데미안은 진도가 있으므로 "읽는 중" 필터에도 그대로 걸린다
    await userEvent.click(screen.getByRole('button', { name: /데미안 선택/ }));
    await userEvent.click(screen.getByRole('button', { name: '읽는 중' }));

    expect(screen.getByRole('heading', { level: 2, name: '데미안' })).toBeInTheDocument();
  });
});
