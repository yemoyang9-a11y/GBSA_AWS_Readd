import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookInfoModal from './BookInfoModal';
import type { BookSummary } from '../../types';

const book: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '/covers/takryu.jpg',
  intro_summary: null,
  ssabi_ready: true,
  progress: { current_page: 104, percent: 25.3 },
};

const content = {
  tags: ['한국 근대문학', '풍자'],
  intro: '탁류는 채만식의 장편소설이다.',
  background: ['첫 번째 배경 지식', '두 번째 배경 지식'],
};

describe('BookInfoModal', () => {
  it('제목·저자·태그·소개·배경 지식을 보여준다', () => {
    render(<BookInfoModal book={book} content={content} onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: '탁류' })).toBeInTheDocument();
    expect(screen.getByText('채만식')).toBeInTheDocument();
    expect(screen.getByText('한국 근대문학')).toBeInTheDocument();
    expect(screen.getByText('풍자')).toBeInTheDocument();
    expect(screen.getByText('탁류는 채만식의 장편소설이다.')).toBeInTheDocument();
    expect(screen.getByText('첫 번째 배경 지식')).toBeInTheDocument();
    expect(screen.getByText('두 번째 배경 지식')).toBeInTheDocument();
  });

  it('닫기 버튼을 누르면 onClose 가 호출된다', async () => {
    const onClose = vi.fn();
    render(<BookInfoModal book={book} content={content} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('배경(오버레이)을 누르면 onClose 가 호출된다', async () => {
    const onClose = vi.fn();
    render(<BookInfoModal book={book} content={content} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('book-info-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape 키를 누르면 onClose 가 호출된다', async () => {
    const onClose = vi.fn();
    render(<BookInfoModal book={book} content={content} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('콘텐츠가 없으면(content undefined) 아무것도 렌더하지 않는다 — 지어낸 값을 보여주지 않는다', () => {
    const { container } = render(
      <BookInfoModal book={book} content={undefined} onClose={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
