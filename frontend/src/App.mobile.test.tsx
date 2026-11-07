import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { createAppRouter } from './App';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterAll(() => vi.unstubAllGlobals());

beforeEach(() => window.history.pushState({}, '', '/books/takryu/read'));

test('모바일 기기면 읽기 라우트에 모바일 읽기 화면을 그린다', () => {
  render(<RouterProvider router={createAppRouter(true)} />);
  expect(screen.getByTestId('mobile-reader')).toBeInTheDocument();
});

test('모바일 기기가 아니면 PC 읽기 화면을 그린다', () => {
  render(<RouterProvider router={createAppRouter(false)} />);
  expect(screen.queryByTestId('mobile-reader')).not.toBeInTheDocument();
});
