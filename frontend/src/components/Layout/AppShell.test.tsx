import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import AppShell from './AppShell';

function Page({ name }: { name: string }) {
  const location = useLocation();
  return (
    <>
      <h1>{name}</h1>
      <p data-testid="location">{`${location.pathname}${location.search}`}</p>
    </>
  );
}

function renderShell(path: string, props: { isMobile: boolean; nav?: boolean }) {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell {...props} />,
        children: [
          { path: '/', element: <Page name="홈" /> },
          { path: '/search', element: <Page name="검색" /> },
          { path: '/shelf', element: <Page name="내 서재" /> },
          { path: '/my', element: <Page name="MY" /> },
          { path: '/books/:bookId', element: <Page name="작품" /> },
        ],
      },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

test('NFR-USE: 모바일 틀은 주 메뉴 4개를 글자와 함께 보여 준다', () => {
  renderShell('/', { isMobile: true });
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  const links = within(nav).getAllByRole('link');
  expect(links.map((link) => link.textContent)).toEqual(['홈', '검색', '서재', 'MY']);
  expect(within(nav).getByRole('link', { name: '홈' })).toHaveAttribute('href', '/');
  expect(within(nav).getByRole('link', { name: '검색' })).toHaveAttribute('href', '/search');
  expect(within(nav).getByRole('link', { name: '서재' })).toHaveAttribute('href', '/shelf');
  expect(within(nav).getByRole('link', { name: 'MY' })).toHaveAttribute('href', '/my');
});

test('NFR-USE: 현재 주소의 메뉴에 aria-current가 붙는다', () => {
  renderShell('/shelf', { isMobile: true });
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  expect(within(nav).getByRole('link', { name: '서재' })).toHaveAttribute('aria-current', 'page');
  for (const name of ['홈', '검색', 'MY']) {
    expect(within(nav).getByRole('link', { name })).not.toHaveAttribute('aria-current');
  }
});

test('NFR-USE: 홈 메뉴는 다른 주소에서 현재 메뉴로 표시되지 않는다', () => {
  renderShell('/search', { isMobile: true });
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  expect(within(nav).getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
  expect(within(nav).getByRole('link', { name: '검색' })).toHaveAttribute('aria-current', 'page');
});

test('모바일 틀의 루트에 data-mobile이 있다', () => {
  const { container } = renderShell('/', { isMobile: true });
  expect(container.firstElementChild).toHaveAttribute('data-mobile', 'true');
  expect(screen.getByRole('heading', { level: 1, name: '홈' })).toBeInTheDocument();
});

test('nav={false}면 주 메뉴가 없다', () => {
  renderShell('/books/takryu', { isMobile: true, nav: false });
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: '작품' })).toBeInTheDocument();
});

test('PC 틀에는 data-mobile이 없고 위 줄 메뉴가 있다', () => {
  const { container } = renderShell('/', { isMobile: false });
  expect(container.firstElementChild).not.toHaveAttribute('data-mobile');
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  expect(within(nav).getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
  expect(within(nav).getByRole('link', { name: '서재' })).toHaveAttribute('href', '/shelf');
  expect(screen.getByRole('link', { name: 'MY' })).toHaveAttribute('href', '/my');
});

test('PC 틀에는 비활성 도서 검색 버튼이 없다', () => {
  renderShell('/', { isMobile: false });
  expect(screen.queryByRole('button', { name: '도서 검색' })).not.toBeInTheDocument();
});

test('PC 틀은 검색 입력에서 Enter를 누르면 /search?q=로 간다', async () => {
  renderShell('/', { isMobile: false });
  await userEvent.type(screen.getByRole('searchbox', { name: '작품, 작가 검색' }), '탁류{Enter}');
  expect(screen.getByTestId('location')).toHaveTextContent('/search?q=%ED%83%81%EB%A5%98');
  expect(screen.getByRole('heading', { level: 1, name: '검색' })).toBeInTheDocument();
});

test('PC 틀은 nav={false}면 위 줄 메뉴 없이 틀만 그린다', () => {
  renderShell('/books/takryu', { isMobile: false, nav: false });
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: '작품' })).toBeInTheDocument();
});
