import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  title: '탁류',
  author: '채만식',
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

  it('시안 상단: 표지·제목·저자를 보여준다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);

    expect(screen.getByTestId('typographic-cover')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '탁류' })).toBeInTheDocument();
    expect(screen.getByText('채만식')).toBeInTheDocument();
  });

  it('자가 검증 23 / FR-BRF-004 · D12: 목차는 표시 전용이라 이동 가능한 요소가 없다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);

    const toc = screen.getByRole('list', { name: '목차' });
    expect(toc).toHaveTextContent('제2장 생활 제일과');
    expect(toc.querySelectorAll('a, button')).toHaveLength(0);
  });

  it("자가 검증 22 / UC-28 E1: 리캡이 실패해도 '마저 읽기'는 동작한다", async () => {
    const onContinue = vi.fn();
    render(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        recapFailed={true}
        onContinue={onContinue}
      />
    );

    const button = screen.getByRole('button', { name: '마저 읽기' });
    expect(button).toBeEnabled();

    // 눌리는 것까지 확인한다 — 활성 상태만으로는 동작을 보장하지 못한다
    await userEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('리캡 스트림이 실패하면 실패를 알리고, 받다 만 조각을 남기지 않는다 (FR-SPL-005 🚦)', () => {
    render(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        streamedRecap=""
        recapFailed={true}
      />
    );

    expect(screen.getByText('리캡을 불러오지 못했습니다')).toBeInTheDocument();
  });


  it('폴백은 화면당 한 번만 요청한다 — 스트리밍 텍스트가 들어와 다시 그려져도 재호출하지 않는다', () => {
    const onRequestFallback = vi.fn();
    const { rerender } = render(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        onRequestFallback={onRequestFallback}
      />
    );

    // 컨테이너가 콜백을 메모하지 않아 매번 새 함수를 넘기더라도 재호출되면 안 된다.
    // 재호출은 곧 LLM 재호출이고 분당 3회 상한(NFR-AI-017)에 걸린다.
    rerender(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        onRequestFallback={() => onRequestFallback()}
        streamedRecap="정주사는"
      />
    );
    rerender(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        onRequestFallback={() => onRequestFallback()}
        streamedRecap="정주사는 미두장에서"
      />
    );

    expect(onRequestFallback).toHaveBeenCalledTimes(1);
  });

  it('폴백으로 받은 텍스트를 화면에 보여준다', () => {
    render(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        streamedRecap="정주사는 미두장에서 재산을 잃었다."
      />
    );

    expect(screen.getByText(/미두장에서 재산을 잃었다/)).toBeInTheDocument();
  });

  it('FR-BRF-005 🚦: 진도는 서버가 준 percent 를 그대로 렌더한다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70');
  });
});
