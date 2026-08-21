import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookGrid from './BookGrid';
import type { BookSummary } from '../../types';

const readyBook: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '/covers/takryu.jpg',
  intro_summary: null,
  ssabi_ready: true,
};

const notReadyBook: BookSummary = {
  book_id: 'draft-book',
  title: '검수 전 도서',
  author: '미상',
  cover_url: '/covers/draft.jpg',
  intro_summary: null,
  ssabi_ready: false,
};

describe('BookGrid', () => {
  it('도서 제목·저자를 렌더한다', () => {
    render(<BookGrid books={[readyBook]} onSelect={() => {}} />);
    expect(screen.getByText('탁류')).toBeInTheDocument();
    expect(screen.getByText('채만식')).toBeInTheDocument();
  });

  it('FR-BRW-002 🚦: 완비 도서를 클릭하면 onSelect가 그 도서로 호출된다', async () => {
    const onSelect = vi.fn();
    render(<BookGrid books={[readyBook]} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /탁류/ }));

    expect(onSelect).toHaveBeenCalledWith(readyBook);
  });

  it('FR-BRW-002 🚦: 미완비 도서는 클릭 불가 — 버튼이 disabled 이고 onSelect가 호출되지 않는다', async () => {
    const onSelect = vi.fn();
    render(<BookGrid books={[notReadyBook]} onSelect={onSelect} />);

    const card = screen.getByRole('button', { name: /검수 전 도서/ });
    expect(card).toBeDisabled();

    await userEvent.click(card);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('FR-BRF-005 🚦: 진도가 있으면 서버가 준 percent 를 그대로 표시하고, 재계산하지 않는다', () => {
    const inProgressBook: BookSummary = {
      ...readyBook,
      progress: { current_page: 80, percent: 19.5 },
    };
    render(<BookGrid books={[inProgressBook]} onSelect={() => {}} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '19.5');
  });

  it('진도가 없는 도서는 진도 바를 렌더하지 않는다', () => {
    render(<BookGrid books={[readyBook]} onSelect={() => {}} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
