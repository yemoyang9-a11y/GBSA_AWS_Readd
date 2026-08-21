import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatbotTab from './ChatbotTab';

/**
 * critique P2 (2026-08-21): 사용자·싸비 말풍선이 정렬(ml-auto/mr-auto)만으로 구분되면
 * 좁은 패널에서 여러 줄 줄바꿈 시 화자 구분이 약하다 — 배경색으로도 구분한다.
 */
describe('ChatbotTab', () => {
  it('싸비 답변 말풍선은 ssabi-soft 배경을 쓴다', () => {
    render(<ChatbotTab answer="정 주사에 대해 답합니다." streaming={false} error={null} onAsk={() => {}} />);
    expect(screen.getByText(/정 주사에 대해/)).toHaveClass('bg-ssabi-soft');
  });

  it('polish: 답변이 없으면(질문 전) 빈 말풍선을 그리지 않는다', () => {
    const { container } = render(
      <ChatbotTab answer="" streaming={false} error={null} onAsk={() => {}} />
    );
    expect(container.querySelector('p')).toBeNull();
  });

  it('사용자 질문 말풍선은 중립(canvas) 배경을 유지한다 — 액센트가 사용자 쪽으로 번지지 않는다', async () => {
    const onAsk = vi.fn();
    render(<ChatbotTab answer="" streaming={false} error={null} onAsk={onAsk} />);

    await userEvent.type(screen.getByLabelText('질문'), '정주사가 누구야');
    await userEvent.click(screen.getByRole('button', { name: '질문' }));

    expect(screen.getByText('정주사가 누구야')).toHaveClass('bg-canvas');
  });
});
