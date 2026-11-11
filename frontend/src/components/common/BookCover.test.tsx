import { render, screen } from '@testing-library/react';
import BookCover from './BookCover';

const book = { book_id: 'hwabun', title: '화분', author: '이효석', cover_url: '' };

test('표지 주소가 빈 문자열이면 제목 글자로 된 표지를 그린다', () => {
  render(<BookCover book={book} size="grid" />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('화분')).toBeInTheDocument();
});

test('표지 주소가 null이어도 제목 글자로 된 표지를 그린다', () => {
  render(<BookCover book={{ ...book, cover_url: null as unknown as string }} size="row" />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('화분')).toBeInTheDocument();
});

test('표지 주소가 있으면 제목을 담은 대체 글자로 이미지를 그린다', () => {
  render(<BookCover book={{ ...book, cover_url: '/covers/hwabun.jpg' }} size="detail" />);
  const img = screen.getByRole('img', { name: '화분 표지' });
  expect(img).toHaveAttribute('src', '/covers/hwabun.jpg');
});

test.each([
  ['thumb', 'w-[44px]'],
  ['row', 'w-[84px]'],
  ['grid', 'w-full'],
  ['detail', 'w-[118px]'],
] as const)('%s 크기는 폭 %s에 2:3 비율이다', (size, widthClass) => {
  const { container } = render(<BookCover book={book} size={size} />);
  const frame = container.firstElementChild as HTMLElement;
  expect(frame.className).toContain(widthClass);
  expect(frame.className).toContain('aspect-[2/3]');
});
