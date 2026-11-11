import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import RouteFade from './RouteFade';

function Counter({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      {`${name} ${count}`}
    </button>
  );
}

function renderFade() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <RouteFade>
            <Outlet />
          </RouteFade>
        ),
        children: [
          { path: '/a', element: <Counter name="가" /> },
          { path: '/b', element: <Counter name="나" /> },
          { path: '/books/:bookId', element: <Counter name="책" /> },
        ],
      },
    ],
    { initialEntries: ['/a'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

const wrapper = () => screen.getByTestId('route-fade');

test('NFR-USE: 화면 래퍼에 페이드 애니메이션이 걸리고 움직임 줄이기 설정에서는 꺼진다', () => {
  renderFade();
  expect(wrapper()).toHaveClass('motion-safe:animate-route-in');
  expect(wrapper().className).not.toMatch(/(^|\s)animate-route-in/);
});

test('NFR-USE: 라우트 경로가 바뀌면 래퍼가 새로 만들어져 페이드가 다시 돈다', async () => {
  const router = renderFade();
  const before = wrapper();

  await act(() => router.navigate('/b'));

  expect(screen.getByRole('button', { name: '나 0' })).toBeInTheDocument();
  expect(wrapper()).not.toBe(before);
  expect(wrapper()).toHaveClass('motion-safe:animate-route-in');
});

test('NFR-USE: 같은 라우트 안의 상태 변화로는 래퍼가 다시 만들어지지 않는다', async () => {
  renderFade();
  const before = wrapper();

  await userEvent.click(screen.getByRole('button', { name: '가 0' }));

  expect(screen.getByRole('button', { name: '가 1' })).toBeInTheDocument();
  expect(wrapper()).toBe(before);
});

test('NFR-USE: 주소의 검색어만 바뀌면 래퍼가 다시 만들어지지 않는다', async () => {
  const router = renderFade();
  const before = wrapper();

  await act(() => router.navigate('/a?q=탁'));

  expect(wrapper()).toBe(before);
});
