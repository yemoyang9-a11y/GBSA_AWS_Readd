import { render, screen, within } from '@testing-library/react';
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
  onBack: () => {},
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

  it('시안 상단: 표지·경과 안내·인사·제목·저자를 보여준다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);

    expect(screen.getByTestId('typographic-cover')).toBeInTheDocument();
    expect(screen.getByText('3일 만이에요')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /다시 오셨네요/ })).toBeInTheDocument();
    expect(screen.getByText('탁류 · 채만식')).toBeInTheDocument();
  });

  it('돌아가기를 누르면 onBack 이 불린다', async () => {
    const onBack = vi.fn();
    render(<BriefingView {...baseProps} briefing={briefing()} onBack={onBack} />);

    await userEvent.click(screen.getByRole('button', { name: '돌아가기' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('자가 검증 23 / FR-BRF-004 · D12: 목차는 표시 전용이라 이동 가능한 요소가 없다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);

    const toc = screen.getByRole('list', { name: '목차' });
    expect(toc).toHaveTextContent('제2장 생활 제일과');
    expect(toc.querySelectorAll('a, button')).toHaveLength(0);
  });

  it("자가 검증 22 / UC-28 E1: 리캡이 실패해도 '이어서 읽기'는 동작한다", async () => {
    const onContinue = vi.fn();
    render(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        recapFailed={true}
        onContinue={onContinue}
      />
    );

    const button = screen.getByRole('button', { name: '이어서 읽기' });
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

  it('2026-08-25: 리캡을 읽기 화면 리캡 탭과 같은 형식(문단 분리·고정 소제목 제거)으로 보여준다', () => {
    render(
      <BriefingView
        {...baseProps}
        briefing={briefing({
          recap: '이전 이야기 요약\n\n정주사는 미두장에서 재산을 잃었다.\n\n초봉은 제중당에서 일한다.',
        })}
      />
    );

    // 고정 소제목은 h3("그동안 이런 이야기였어요")가 이미 있어 본문에서는 걷어낸다
    expect(screen.queryByText('이전 이야기 요약')).not.toBeInTheDocument();
    expect(screen.getByText('정주사는 미두장에서 재산을 잃었다.')).toBeInTheDocument();
    expect(screen.getByText('초봉은 제중당에서 일한다.')).toBeInTheDocument();
  });

  it('2026-08-25: 폴백 스트림이 진행 중이면 "불러오는 중"을 보여준다', () => {
    render(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        streamedRecap="정주사는"
        recapStreaming={true}
      />
    );

    expect(screen.getByText('불러오는 중')).toBeInTheDocument();
  });

  it('FR-BRF-005 🚦: 진도는 서버가 준 percent 를 그대로 렌더한다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70');
  });

  it('2026-08-25: 전체 페이지 수는 진도 바 위 우측에, 퍼센트는 진도 바 아래에 보여준다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);
    const bar = screen.getByRole('progressbar');

    const totalPagesEl = screen.getByText('30쪽');
    expect(totalPagesEl.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const percentEl = screen.getByText('70%');
    expect(bar.compareDocumentPosition(percentEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('목차는 기본이 접힘이다 — 펼치기 전에는 화면에서 안 보인다(grid-rows-[0fr])', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);
    expect(screen.getByTestId('toc-panel').className).toContain('grid-rows-[0fr]');
  });

  it('목차 토글을 누르면 펼쳐지고, 다시 누르면 접힌다', async () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);

    const toggle = screen.getByRole('button', { name: /목차/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('toc-panel').className).toContain('grid-rows-[1fr]');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('toc-panel').className).toContain('grid-rows-[0fr]');
  });

  it('현재 장 행만 강조된다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);
    // "제3장 신판 흥부전"은 진도 패널의 장 제목과 목차 항목 두 곳에 나오므로 목차로 좁힌다
    const toc = screen.getByRole('list', { name: '목차' });
    const current = within(toc).getByText('제3장 신판 흥부전').closest('li')!;
    const other = within(toc).getByText('제1장 인간기념물').closest('li')!;
    expect(current.className).toContain('bg-brief-accent-soft');
    expect(other.className).not.toContain('bg-brief-accent-soft');
  });
});
