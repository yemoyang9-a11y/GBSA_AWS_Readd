import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import Briefing from './pages/Briefing';
import Reader from './pages/Reader';
import { useCatalog } from './hooks/useCatalog';
import { useEnterBook } from './hooks/useEnterBook';
import { resumeLabel } from './utils/resumeLabel';
import { BOOK_ROUTES } from './utils/routes';

/**
 * 관통 흐름 — CP3 정지선의 R4 책임 (대시보드 → 브리핑 → 읽기 → 싸비).
 *
 * 백엔드 엔드포인트가 아직 501 스텁이라 mocks/ 대역을 상대로 돈다. 따라서 이 테스트가
 * 증명하는 것은 **화면 연결과 라우팅**이지 서버 동작이 아니다 — 상한 게이트(자가 검증 1~14)는
 * 실제 API가 붙은 뒤 그쪽을 대상으로 따로 검증해야 한다.
 */
function EntryStart() {
  const { books, status } = useCatalog();
  const { enter, busyId } = useEnterBook();
  if (status !== 'ready') return <p>불러오는 중</p>;
  return (
    <ul aria-label="작품 목록">
      {books.map((book) => (
        <li key={book.book_id}>
          <h2>{book.title}</h2>
          <button
            type="button"
            disabled={!book.ssabi_ready || busyId !== null}
            onClick={() => void enter(book.book_id)}
          >
            {resumeLabel(book, busyId === book.book_id)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function renderFlow() {
  const router = createMemoryRouter(
    [
      { path: '/start', element: <EntryStart /> },
      { path: BOOK_ROUTES.briefing, element: <Briefing /> },
      { path: BOOK_ROUTES.reader, element: <Reader /> },
    ],
    { initialEntries: ['/start'] }
  );
  render(<RouterProvider router={router} />);
}

describe('관통 흐름 (mock 기준)', () => {
  it('작품 목록에서 책에 들어가면 브리핑을 거쳐 읽기 화면까지 이어진다', async () => {
    renderFlow();

    const takryu = (await screen.findByRole('heading', { level: 2, name: '탁류' })).closest('li')!;
    const notReady = screen.getByRole('heading', { level: 2, name: '검수 전 도서' }).closest('li')!;

    // FR-BRW-002 🚦
    expect(within(notReady).getByRole('button', { name: '아직 준비 중입니다' })).toBeDisabled();

    // FR-BRF-001
    await userEvent.click(within(takryu).getByRole('button', { name: '이어서 읽기' }));

    await waitFor(() => {
      expect(screen.getByRole('list', { name: '목차' })).toBeInTheDocument();
    });
    // 브리핑 목차도 장을 눌러 이동할 수 있다 (2026-08-26, FR-BRF-004·D12 뒤집음 —
    // BriefingView.tsx 상단 ⚠️ 주석). 읽기 화면 목차와 같은 이동 요소를 만든다.
    expect(
      screen.getByRole('list', { name: '목차' }).querySelectorAll('button').length
    ).toBeGreaterThan(0);

    // '이어서 읽기' → 읽기 화면
    await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

    expect(await screen.findByRole('article')).toHaveTextContent('mock 본문');

    // 읽기 화면에는 진도 바가 없고 페이지 번호만 있다 (FR-PRG-004)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '페이지로 이동' })).toBeInTheDocument();
    expect(screen.getByText('/ 30')).toBeInTheDocument();

    // 싸비는 닫힌 채로 들어온다 — 사용자가 top-bar 우측 토글을 눌러야 열린다
    expect(screen.queryByRole('tab', { name: '인물 관계도' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '싸비 열기' }));

    // 싸비 사이드창의 기본 탭은 인물 관계도다 (FR-SVB-002)
    expect(screen.getByRole('tab', { name: '인물 관계도' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
