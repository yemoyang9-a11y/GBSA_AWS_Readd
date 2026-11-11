import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MobileBriefingView from './MobileBriefingView';
import type { BriefingResponse, ChapterSummary } from '../../types';

const chapters: ChapterSummary[] = [
  { chapter_no: 1, title: '인간기념물', start_page: 1, end_page: 10 },
  { chapter_no: 2, title: '생활 제일과', start_page: 11, end_page: 20 },
];

function briefing(overrides: Partial<BriefingResponse> = {}): BriefingResponse {
  return {
    applied_cutoff: 15,
    recap: '정주사는 미두장에서 재산을 잃었다.',
    current_chapter: { chapter_no: 2, title: '생활 제일과' },
    progress: { current_page: 15, total_pages: 20, percent: 75 },
    ...overrides,
  };
}

const baseProps = {
  chapters,
  title: '탁류',
  author: '채만식',
  coverUrl: null,
  onContinue: () => {},
  onRequestFallback: () => {},
  onBack: () => {},
  onSelectChapter: () => {},
  streamedRecap: '',
  recapFailed: false,
  recapStreaming: false,
  characterNames: [],
};

// FR-BRF-001
test('FR-BRF-001: 이어서 읽기 버튼은 화면 아래 고정 줄에 하나만 있다', () => {
  render(<MobileBriefingView {...baseProps} briefing={briefing()} />);

  const buttons = screen.getAllByRole('button', { name: '이어서 읽기' });
  expect(buttons).toHaveLength(1);
  const bar = buttons[0].closest('[data-testid="briefing-continue-bar"]');
  expect(bar).not.toBeNull();
  expect(bar).toHaveClass('fixed', 'bottom-0');
  expect(buttons[0].closest('section[aria-label="진도"]')).toBeNull();
});

// FR-SPL-005 🚦
test('FR-SPL-005: 줄거리가 없어도(recap null) 이어서 읽기 버튼이 눌린다', async () => {
  const onContinue = vi.fn();
  render(
    <MobileBriefingView
      {...baseProps}
      briefing={briefing({ recap: null, applied_cutoff: 0 })}
      onContinue={onContinue}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));
  expect(onContinue).toHaveBeenCalledTimes(1);
});

// FR-SPL-005 🚦
test('FR-SPL-005: 줄거리를 불러오는 중이어도 이어서 읽기 버튼이 눌린다', async () => {
  const onContinue = vi.fn();
  render(
    <MobileBriefingView
      {...baseProps}
      briefing={briefing({ recap: null })}
      recapStreaming
      onContinue={onContinue}
    />
  );

  expect(screen.getByText('불러오는 중')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));
  expect(onContinue).toHaveBeenCalledTimes(1);
});

// FR-SPL-005 🚦
test('FR-SPL-005: 줄거리 불러오기에 실패해도 이어서 읽기 버튼이 눌린다', async () => {
  const onContinue = vi.fn();
  render(
    <MobileBriefingView
      {...baseProps}
      briefing={briefing({ recap: null })}
      recapFailed
      onContinue={onContinue}
    />
  );

  expect(screen.getByRole('alert')).toHaveTextContent('리캡을 불러오지 못했습니다');
  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));
  expect(onContinue).toHaveBeenCalledTimes(1);
});
