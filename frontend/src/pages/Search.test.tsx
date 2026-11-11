import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Search from './Search';
import { mockCatalog } from '../../mocks/fixtures';
import type { CatalogResponse } from '../types';

const fetchCatalogMock = vi.fn<() => Promise<CatalogResponse>>();

vi.mock('../services/bookService', () => ({
  fetchCatalog: () => fetchCatalogMock(),
}));

function Location() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderSearch(entry = '/search') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/search"
          element={
            <>
              <Search />
              <Location />
            </>
          }
        />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>
  );
}

const resultNames = () => within(screen.getByRole('list')).getAllByRole('link').map((link) => link.getAttribute('aria-label'));

beforeEach(() => {
  fetchCatalogMock.mockReset();
  fetchCatalogMock.mockResolvedValue({ books: mockCatalog });
});

test('FR-BRW-001: 검색어가 비면 전체 작품을 서버가 준 순서로 보여 준다', async () => {
  renderSearch();

  await screen.findByRole('list');
  expect(resultNames()).toEqual(['탁류', '검수 전 도서', '읽지 않은 책', '다 읽은 책']);
});

test('FR-BRW-001: 주소의 q로 입력창이 채워지고 결과가 걸러진다', async () => {
  renderSearch('/search?q=탁');

  expect(screen.getByLabelText('작품, 작가 검색')).toHaveValue('탁');
  await screen.findByRole('list');
  expect(resultNames()).toEqual(['탁류']);
});

test('FR-BRW-001: 입력하면 주소의 q가 바뀌고 결과가 걸러진다', async () => {
  const user = userEvent.setup();
  renderSearch();
  await screen.findByRole('list');

  await user.type(screen.getByLabelText('작품, 작가 검색'), '시험');

  expect(screen.getByTestId('location')).toHaveTextContent('/search?q=%EC%8B%9C%ED%97%98');
  expect(resultNames()).toEqual(['읽지 않은 책', '다 읽은 책']);
});

test('FR-BRW-001: 결과가 없으면 안내 문구를 보여 준다', async () => {
  renderSearch('/search?q=없는작품');

  expect(await screen.findByText('찾는 작품이 없습니다')).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

test('FR-BRW-001: 기호가 들어와도 오류 없이 안내 문구를 보여 준다', async () => {
  renderSearch(`/search?q=${encodeURIComponent('(*[')}`);

  expect(await screen.findByText('찾는 작품이 없습니다')).toBeInTheDocument();
});

test('FR-BRW-001: 결과를 누르면 작품 페이지로 간다', async () => {
  const user = userEvent.setup();
  renderSearch('/search?q=탁류');

  await user.click(await screen.findByRole('link', { name: '탁류' }));

  expect(screen.getByTestId('location')).toHaveTextContent('/books/takryu');
});

test('FR-BRW-001: 결과에 제목과 저자가 보인다', async () => {
  renderSearch('/search?q=탁류');

  const link = await screen.findByRole('link', { name: '탁류' });
  expect(within(link).getByText('채만식')).toBeInTheDocument();
});

test('NFR-USE: 입력창은 type=search이고 보이는 라벨이 연결돼 있다', () => {
  renderSearch();

  const input = screen.getByLabelText('작품, 작가 검색');
  expect(input).toHaveAttribute('type', 'search');
});

test('FR-SPL-005: 목록을 못 불러오면 안내와 다시 시도 버튼을 보여 주고 누르면 다시 부른다', async () => {
  const user = userEvent.setup();
  fetchCatalogMock.mockRejectedValueOnce(new Error('network'));
  renderSearch();

  expect(await screen.findByText('작품을 불러오지 못했습니다')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '다시 시도' }));

  expect(await screen.findByRole('list')).toBeInTheDocument();
  expect(fetchCatalogMock).toHaveBeenCalledTimes(2);
});
