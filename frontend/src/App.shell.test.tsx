import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { createAppRouter } from './App';

function renderAt(path: string, isMobile: boolean) {
  window.history.pushState({}, '', path);
  return render(<RouterProvider router={createAppRouter(isMobile)} />);
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe.each([
  ['모바일', true],
  ['PC', false],
])('%s 경로 구성', (_label, isMobile) => {
  test.each([
    ['/', '홈'],
    ['/search', '검색'],
    ['/shelf', '내 서재'],
    ['/my', 'MY'],
  ])('%s 주소는 %s 화면을 그린다', (path, name) => {
    renderAt(path, isMobile);
    expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeInTheDocument();
  });
});

test('모바일 작품 페이지에는 주 메뉴가 없다', () => {
  const { container } = renderAt('/books/takryu', true);
  expect(screen.getByRole('button', { name: '뒤로 가기' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
  expect(container.firstElementChild).toHaveAttribute('data-mobile', 'true');
});

test('PC 작품 페이지에는 위 줄 메뉴가 있다', () => {
  renderAt('/books/takryu', false);
  expect(screen.getByRole('button', { name: '뒤로 가기' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  expect(within(nav).getByRole('link', { name: '서재' })).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: '작품, 작가 검색' })).toBeInTheDocument();
});

test('PC 검색 화면에는 작품, 작가 검색 입력이 본문에 하나만 있다', () => {
  renderAt('/search?q=탁', false);
  const inputs = screen.getAllByRole('searchbox', { name: '작품, 작가 검색' });
  expect(inputs).toHaveLength(1);
  expect(inputs[0]).toHaveValue('탁');
  expect(screen.queryByRole('search')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'MY' })).toBeInTheDocument();
});

test('PC 검색 화면이 아니면 위 줄에 검색 입력이 있다', () => {
  renderAt('/shelf', false);
  expect(
    within(screen.getByRole('search')).getByRole('searchbox', { name: '작품, 작가 검색' })
  ).toBeInTheDocument();
});

test('브리핑과 읽기 주소는 틀 없이 지금 화면을 그린다', async () => {
  const mobileRead = renderAt('/books/takryu/read', true);
  expect(screen.getByTestId('mobile-reader')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
  mobileRead.unmount();

  const mobileBriefing = renderAt('/books/takryu/briefing', true);
  expect(await screen.findByTestId('mobile-briefing')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
  mobileBriefing.unmount();

  const pcRead = renderAt('/books/takryu/read', false);
  expect(await screen.findByRole('article')).toBeInTheDocument();
  expect(screen.queryByTestId('mobile-reader')).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  pcRead.unmount();

  renderAt('/books/takryu/briefing', false);
  expect(await screen.findByRole('list', { name: '목차' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
});

test('없는 주소는 지금의 찾을 수 없음 화면을 그린다', () => {
  const pc = renderAt('/nowhere/at/all', false);
  expect(screen.getByText('페이지를 찾을 수 없습니다')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
  pc.unmount();

  renderAt('/nowhere/at/all', true);
  expect(screen.getByTestId('mobile-not-found')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
});

describe.each([
  ['모바일', true],
  ['PC', false],
])('%s 화면 전환 페이드', (_label, isMobile) => {
  test('NFR-USE: 최상위 화면 내용은 페이드 래퍼 안에 있고 주 메뉴는 래퍼 밖에 있다', () => {
    renderAt('/shelf', isMobile);
    const fade = screen.getByTestId('route-fade');
    expect(within(fade).getByRole('heading', { level: 1, name: '내 서재' })).toBeInTheDocument();
    expect(fade).not.toContainElement(screen.getByRole('navigation', { name: '주 메뉴' }));
  });

  test('NFR-USE: 읽기 화면에서 쪽을 넘기고 아모 패널을 열어도 페이드가 다시 돌지 않는다', async () => {
    const user = userEvent.setup();
    renderAt('/books/takryu/read', isMobile);
    await screen.findByRole('article');
    const fade = screen.getByTestId('route-fade');
    expect(fade).toContainElement(screen.getByRole('article'));

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));
    await user.click(screen.getByRole('button', { name: '싸비 열기' }));

    expect(screen.getByTestId('route-fade')).toBe(fade);
  });
});
