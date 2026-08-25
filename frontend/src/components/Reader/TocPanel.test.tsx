import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TocPanel from './TocPanel';
import type { ChapterSummary } from '../../types';

const chapters: ChapterSummary[] = [
  { chapter_no: 1, title: '제1장 인간기념물', start_page: 1, end_page: 10 },
  { chapter_no: 2, title: '제2장 생활 제일과', start_page: 11, end_page: 20 },
  { chapter_no: 3, title: '제3장 신판 흥부전', start_page: 21, end_page: 30 },
];

describe('TocPanel', () => {
  it('모든 장을 순서대로 보여준다 — 상한 필터링 없음(FR-NAV-001)', () => {
    render(<TocPanel chapters={chapters} currentPage={5} onSelectChapter={() => {}} />);
    expect(screen.getByText('제1장 인간기념물')).toBeInTheDocument();
    expect(screen.getByText('제2장 생활 제일과')).toBeInTheDocument();
    expect(screen.getByText('제3장 신판 흥부전')).toBeInTheDocument();
  });

  it('현재 페이지가 속한 장에만 aria-current를 표시한다', () => {
    render(<TocPanel chapters={chapters} currentPage={15} onSelectChapter={() => {}} />);
    expect(screen.getByRole('button', { name: /제2장/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /제1장/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: /제3장/ })).not.toHaveAttribute('aria-current');
  });

  it('장을 누르면 그 장의 start_page로 onSelectChapter를 호출한다 — 프론트가 계산하지 않고 서버 값 그대로', async () => {
    const onSelectChapter = vi.fn();
    render(<TocPanel chapters={chapters} currentPage={1} onSelectChapter={onSelectChapter} />);
    await userEvent.click(screen.getByRole('button', { name: /제3장/ }));
    expect(onSelectChapter).toHaveBeenCalledWith(21);
  });

  it('목차가 비어 있으면(로딩 중) 안내 문구를 보여준다', () => {
    render(<TocPanel chapters={[]} currentPage={null} onSelectChapter={() => {}} />);
    expect(screen.getByText('목차를 불러오는 중')).toBeInTheDocument();
  });
});
