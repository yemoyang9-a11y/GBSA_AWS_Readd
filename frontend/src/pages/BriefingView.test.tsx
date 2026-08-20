import { render, screen } from '@testing-library/react';
import BriefingView from './BriefingView';
import type { BriefingResponse, ChapterSummary } from '../types';

const chapters: ChapterSummary[] = [
  { chapter_no: 1, title: '제1장 인간기념물', start_page: 1, end_page: 10 },
  { chapter_no: 2, title: '제2장 생활 제일과', start_page: 11, end_page: 20 },
  { chapter_no: 3, title: '제3장 신판 흥부전', start_page: 21, end_page: 30 },
];

function briefing(overrides: Partial<BriefingResponse> = {}): BriefingResponse {
  return {
    applied_cutoff: 20,
    recap: '정주사는 미두장에서 재산을 잃었다.',
    current_chapter: { chapter_no: 3, title: '제3장 신판 흥부전' },
    progress: { current_page: 21, total_pages: 30, percent: 70 },
    ...overrides,
  };
}

const baseProps = {
  chapters,
  onContinue: () => {},
  onRequestFallback: () => {},
};

/**
 * 브리핑 화면 (S6) — FR-BRF-002~005, D12, D13 ①
 */
describe('브리핑 화면', () => {
  it('저장 리캡이 있으면 그대로 보여준다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);
    expect(screen.getByText(/미두장에서 재산을 잃었다/)).toBeInTheDocument();
  });

  it('자가 검증 20 / D13 ①: 첫 진입은 빈 상태 문구를 띄우고 폴백을 호출하지 않는다', () => {
    const onRequestFallback = vi.fn();
    render(
      <BriefingView
        {...baseProps}
        briefing={briefing({ applied_cutoff: 0, recap: null })}
        onRequestFallback={onRequestFallback}
      />
    );

    expect(screen.getByText('아직 읽은 내용이 없습니다')).toBeInTheDocument();
    expect(onRequestFallback).not.toHaveBeenCalled();
  });

  it('자가 검증 21: 저장분이 없으면 폴백을 호출한다', () => {
    const onRequestFallback = vi.fn();
    render(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        onRequestFallback={onRequestFallback}
      />
    );

    expect(onRequestFallback).toHaveBeenCalledTimes(1);
  });

  it('자가 검증 23 / FR-BRF-004 · D12: 목차는 표시 전용이라 이동 가능한 요소가 없다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);

    const toc = screen.getByRole('list', { name: '목차' });
    expect(toc).toHaveTextContent('제2장 생활 제일과');
    expect(toc.querySelectorAll('a, button')).toHaveLength(0);
  });

  it("자가 검증 22 / UC-28 E1: 리캡이 실패해도 '마저 읽기'는 동작한다", () => {
    render(
      <BriefingView {...baseProps} briefing={briefing({ recap: null })} recapFailed={true} />
    );

    expect(screen.getByRole('button', { name: '마저 읽기' })).toBeEnabled();
  });

  it('FR-BRF-005 🚦: 진도는 서버가 준 percent 를 그대로 렌더한다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70');
  });
});
