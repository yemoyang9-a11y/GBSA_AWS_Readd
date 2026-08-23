import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContinueReadingHero from './ContinueReadingHero';
import type { BookSummary } from '../../types';

const reading: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  progress: { current_page: 72, percent: 25.3 },
};

describe('ContinueReadingHero', () => {
  it('진도 있는 책 — 제목·저자·진도·이어서 읽기 버튼을 보여준다', async () => {
    const onResume = vi.fn();
    render(<ContinueReadingHero book={reading} onResume={onResume} />);

    expect(screen.getByText('CONTINUE READING')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();
    // 표지가 없어 TypographicCover 의 aria-hidden 폴백도 저자를 자체 렌더한다 —
    // 히어로 본문 저자와 합쳐 두 곳에 나온다(Task 4·8과 동일한 사정).
    expect(screen.getAllByText('채만식')).toHaveLength(2);
    expect(screen.getByText('25.3% 완료')).toBeInTheDocument();
    expect(screen.getByText('72쪽')).toBeInTheDocument();
    // 총 페이지가 계약에 없으므로 분수를 만들지 않는다
    expect(screen.queryByText(/\/\s*\d+쪽/)).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: '이어서 읽기' });
    await userEvent.click(button);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('진도 없는 책 — "새로 시작하기" 상태를 보여준다', () => {
    const unread: BookSummary = { ...reading, progress: undefined };
    render(<ContinueReadingHero book={unread} onResume={() => {}} />);

    expect(screen.getByText('새로 시작하기')).toBeInTheDocument();
    expect(screen.queryByText(/% 완료/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '읽기 시작' })).toBeInTheDocument();
  });

  it('진행 중(busy)이면 버튼이 잠기고 문구가 바뀐다', () => {
    render(<ContinueReadingHero book={reading} onResume={() => {}} busy />);
    expect(screen.getByRole('button', { name: '여는 중' })).toBeDisabled();
  });

  it('미완비 도서 — 버튼이 항상 비활성이고 이유를 말한다 (FR-BRW-002)', () => {
    const notReady: BookSummary = { ...reading, ssabi_ready: false };
    render(<ContinueReadingHero book={notReady} onResume={() => {}} />);

    expect(screen.getByText('준비 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '아직 준비 중입니다' })).toBeDisabled();
  });
});
