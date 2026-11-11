import { render, screen, within } from '@testing-library/react';
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
  expect(screen.getByRole('heading', { level: 1, name: '작품' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument();
  expect(container.firstElementChild).toHaveAttribute('data-mobile', 'true');
});

test('PC 작품 페이지에는 위 줄 메뉴가 있다', () => {
  renderAt('/books/takryu', false);
  expect(screen.getByRole('heading', { level: 1, name: '작품' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: '주 메뉴' });
  expect(within(nav).getByRole('link', { name: '서재' })).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: '작품, 작가 검색' })).toBeInTheDocument();
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
