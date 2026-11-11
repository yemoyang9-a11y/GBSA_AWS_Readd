import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Shelf from './Shelf';
import { mockCatalog } from '../../mocks/fixtures';
import type { BookSummary, CatalogResponse } from '../types';

const fetchCatalogMock = vi.fn<() => Promise<CatalogResponse>>();

vi.mock('../services/bookService', () => ({
  fetchCatalog: () => fetchCatalogMock(),
}));

function Location() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderShelf() {
  return render(
    <MemoryRouter initialEntries={['/shelf']}>
      <Routes>
        <Route path="/shelf" element={<Shelf />} />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>
  );
}

const bookLinks = () =>
  within(screen.getByRole('list', { name: '서재 책 목록' }))
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label'));

const filter = (name: string) => screen.getByRole('radio', { name });

beforeEach(() => {
  fetchCatalogMock.mockReset();
  fetchCatalogMock.mockResolvedValue({ books: mockCatalog });
});

test('FR-BRW-001: 진도가 있는 책만 보여 준다', async () => {
  renderShelf();

  await screen.findByRole('list', { name: '서재 책 목록' });
  expect(bookLinks()).toEqual(['탁류', '다 읽은 책']);
  expect(screen.queryByRole('link', { name: '읽지 않은 책' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '검수 전 도서' })).not.toBeInTheDocument();
});

test('FR-BRF-005: 퍼센트는 서버가 준 값을 그대로 보여 준다', async () => {
  renderShelf();

  const list = await screen.findByRole('list', { name: '서재 책 목록' });
  expect(within(list).getByText('70%')).toBeInTheDocument();
  expect(within(list).getByText('100%')).toBeInTheDocument();
});

test('FR-BRW-001: 권수는 서재의 책 전체 수이고 필터를 바꿔도 같다', async () => {
  const user = userEvent.setup();
  renderShelf();
  await screen.findByRole('list', { name: '서재 책 목록' });

  expect(screen.getByText('2권')).toBeInTheDocument();
  await user.click(filter('완독'));
  expect(screen.getByText('2권')).toBeInTheDocument();
  await user.click(filter('읽는 중'));
  expect(screen.getByText('2권')).toBeInTheDocument();
});

test('FR-BRF-005: 완독 필터는 서버가 is_complete: true라고 한 책만 보여 준다', async () => {
  const user = userEvent.setup();
  renderShelf();
  await screen.findByRole('list', { name: '서재 책 목록' });

  await user.click(filter('완독'));

  expect(bookLinks()).toEqual(['다 읽은 책']);
});

test('FR-BRF-005: 읽는 중 필터는 is_complete: false인 책만 보여 준다', async () => {
  const user = userEvent.setup();
  renderShelf();
  await screen.findByRole('list', { name: '서재 책 목록' });

  await user.click(filter('읽는 중'));

  expect(bookLinks()).toEqual(['탁류']);
});

test('FR-BRF-005: percent가 100이어도 is_complete가 false면 완독 필터에 없다', async () => {
  const user = userEvent.setup();
  const almost: BookSummary = {
    ...mockCatalog[0],
    book_id: 'almost-book',
    title: '거의 다 읽은 책',
    progress: { current_page: 30, percent: 100, is_complete: false, last_read_at: '2026-11-08T00:00:00.000Z' },
  };
  fetchCatalogMock.mockResolvedValue({ books: [almost, mockCatalog[3]] });
  renderShelf();
  await screen.findByRole('list', { name: '서재 책 목록' });

  await user.click(filter('완독'));
  expect(bookLinks()).toEqual(['다 읽은 책']);

  await user.click(filter('읽는 중'));
  expect(bookLinks()).toEqual(['거의 다 읽은 책']);
});

test('FR-BRF-005: is_complete가 true면 percent가 100이 아니어도 완독 필터에 있다', async () => {
  const user = userEvent.setup();
  const odd: BookSummary = {
    ...mockCatalog[3],
    book_id: 'odd-book',
    title: '서버가 완독이라 한 책',
    progress: { current_page: 20, percent: 95, is_complete: true, last_read_at: '2026-11-08T00:00:00.000Z' },
  };
  fetchCatalogMock.mockResolvedValue({ books: [odd, mockCatalog[0]] });
  renderShelf();
  await screen.findByRole('list', { name: '서재 책 목록' });

  await user.click(filter('완독'));

  expect(bookLinks()).toEqual(['서버가 완독이라 한 책']);
});

test('필터에 맞는 책이 없으면 해당하는 책이 없어요를 보여 준다', async () => {
  const user = userEvent.setup();
  fetchCatalogMock.mockResolvedValue({ books: [mockCatalog[0]] });
  renderShelf();
  await screen.findByRole('list', { name: '서재 책 목록' });

  await user.click(filter('완독'));

  expect(screen.getByText('해당하는 책이 없어요')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: '서재 책 목록' })).not.toBeInTheDocument();
  expect(screen.queryByText('아직 읽기 시작한 책이 없어요')).not.toBeInTheDocument();
});

test('필터는 처음에 전체이고 좌우 화살표 키로 옮겨지며 고른 것에 aria-checked가 붙는다', async () => {
  const user = userEvent.setup();
  renderShelf();
  await screen.findByRole('list', { name: '서재 책 목록' });

  expect(screen.getByRole('radiogroup', { name: '서재 필터' })).toBeInTheDocument();
  expect(filter('전체')).toHaveAttribute('aria-checked', 'true');
  expect(filter('읽는 중')).toHaveAttribute('aria-checked', 'false');

  filter('전체').focus();
  await user.keyboard('{ArrowRight}');
  expect(filter('읽는 중')).toHaveAttribute('aria-checked', 'true');
  expect(filter('읽는 중')).toHaveFocus();
  expect(bookLinks()).toEqual(['탁류']);

  await user.keyboard('{ArrowRight}');
  expect(filter('완독')).toHaveAttribute('aria-checked', 'true');

  await user.keyboard('{ArrowRight}');
  expect(filter('전체')).toHaveAttribute('aria-checked', 'true');

  await user.keyboard('{ArrowLeft}');
  expect(filter('완독')).toHaveAttribute('aria-checked', 'true');
});

test('읽기 시작한 책이 없으면 안내와 홈으로 가는 링크를 보여 준다', async () => {
  fetchCatalogMock.mockResolvedValue({ books: [mockCatalog[1], mockCatalog[2]] });
  renderShelf();

  expect(await screen.findByText('아직 읽기 시작한 책이 없어요')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '홈에서 작품 찾기' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('radiogroup', { name: '서재 필터' })).not.toBeInTheDocument();
  expect(screen.queryByText('해당하는 책이 없어요')).not.toBeInTheDocument();
});

test('FR-SPL-005: 목록을 못 불러오면 다시 시도 버튼을 보여 주고 누르면 다시 부른다', async () => {
  const user = userEvent.setup();
  fetchCatalogMock.mockRejectedValueOnce(new Error('E2E_FAIL'));
  renderShelf();

  expect(await screen.findByText('작품을 불러오지 못했습니다')).toBeInTheDocument();
  expect(screen.queryByText('아직 읽기 시작한 책이 없어요')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '다시 시도' }));

  await screen.findByRole('list', { name: '서재 책 목록' });
  expect(fetchCatalogMock).toHaveBeenCalledTimes(2);
});

test('불러오는 동안 불러오는 중 표시가 보인다', () => {
  fetchCatalogMock.mockReturnValue(new Promise(() => undefined));
  renderShelf();

  expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
});

test('FR-BRW-001: 표지를 누르면 작품 페이지로 간다', async () => {
  const user = userEvent.setup();
  renderShelf();
  const list = await screen.findByRole('list', { name: '서재 책 목록' });

  expect(within(list).getByRole('link', { name: '탁류' })).toHaveAttribute('href', '/books/takryu');
  await user.click(within(list).getByRole('link', { name: '탁류' }));

  expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu');
});
