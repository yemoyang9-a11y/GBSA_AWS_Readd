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

  /**
   * 크리틱 후속 (2026-08-22): 미완비 도서는 흐릿해지기만 하고 **왜** 못 누르는지 한 글자도
   * 없었다. 배포 카탈로그에 `ssabi_ready: false` 인 도서가 실제로 있어(test-book-2)
   * 첫 화면에 이유 없이 죽은 카드가 뜬다.
   */
  it('미완비 도서는 왜 못 여는지 말한다', () => {
    render(<BookCard book={{ ...book, ssabi_ready: false }} onSelect={() => {}} />);
    expect(screen.getByText('아직 준비 중입니다')).toBeInTheDocument();
  });

  it('준비된 도서에는 준비 중 문구를 붙이지 않는다', () => {
    render(<BookCard book={book} onSelect={() => {}} />);
    expect(screen.queryByText('아직 준비 중입니다')).not.toBeInTheDocument();
  });

  it('진도가 있으면 서버 percent 를 그대로 표시하고 "n% 완료" 라벨을 붙인다', () => {
    render(<BookCard book={{ ...book, progress: { current_page: 80, percent: 64 } }} onSelect={() => {}} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '64');
    expect(screen.getByText('64% 완료')).toBeInTheDocument();
    // "읽는 중" 라벨은 뺐다 — 같은 말이 통계 라벨·필터 탭·카드 세 곳에 쌓여 서로 다른
    // 세 의미(개수·필터·상태)를 뭉뚱그렸다 (크리틱, 2026-08-22).
    expect(screen.queryByText('읽는 중')).not.toBeInTheDocument();
  });

  it('다른 카드가 진입 왕복 중이면(busy) 버튼을 잠근다', async () => {
    const onSelect = vi.fn();
    render(<BookCard book={book} onSelect={onSelect} busy />);
    const button = screen.getByRole('button', { name: /탁류/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
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
