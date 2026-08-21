import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookCard from './BookCard';
import type { BookSummary } from '../../types';

const book: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
};

describe('BookCard', () => {
  it('제목·저자를 렌더하고 버튼 이름에 제목이 들어간다', async () => {
    render(<BookCard book={book} onSelect={() => {}} />);
    // 조판 표지와 정보 영역 양쪽에 제목이 나온다
    expect(screen.getAllByText('탁류').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /탁류/ })).toBeInTheDocument();
  });

  it('클릭하면 onSelect 가 그 도서로 호출된다', async () => {
    const onSelect = vi.fn();
    render(<BookCard book={book} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /탁류/ }));
    expect(onSelect).toHaveBeenCalledWith(book);
  });

  it('FR-BRW-002 🚦: 미완비 도서는 버튼이 disabled 이고 onSelect 가 호출되지 않는다', async () => {
    const onSelect = vi.fn();
    render(<BookCard book={{ ...book, ssabi_ready: false }} onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: /탁류/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('진도가 있으면 서버 percent 를 그대로 표시하고 "n% 완료" 라벨을 붙인다', () => {
    render(<BookCard book={{ ...book, progress: { current_page: 80, percent: 64 } }} onSelect={() => {}} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '64');
    expect(screen.getByText('64% 완료')).toBeInTheDocument();
    expect(screen.getByText('읽는 중')).toBeInTheDocument();
  });

  it('진도가 없으면 진도 영역을 그리지 않는다', () => {
    render(<BookCard book={book} onSelect={() => {}} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('intro_summary 가 없으면 소개 영역을 비운다 — 계약 미확정 필드다 (스펙 §7 #5)', () => {
    render(<BookCard book={book} onSelect={() => {}} />);
    expect(screen.queryByTestId('book-intro')).not.toBeInTheDocument();
  });
});
