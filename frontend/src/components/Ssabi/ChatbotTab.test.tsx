import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatbotTab from './ChatbotTab';

describe('ChatbotTab', () => {
  it('싸비 답변 말풍선은 accent 테두리를 쓰고 옆에 마스코트 아바타 이미지가 있다', () => {
    const { container } = render(
      <ChatbotTab answer="정 주사에 대해 답합니다." streaming={false} error={null} onAsk={() => {}} />
    );
    expect(screen.getByText(/정 주사에 대해/)).toHaveClass('border-brief-accent');
    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/ssabi-face.png');
  });

  it('polish: 답변이 없으면(질문 전) 빈 말풍선을 그리지 않는다', () => {
    const { container } = render(
      <ChatbotTab answer="" streaming={false} error={null} onAsk={() => {}} />
    );
    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('사용자 질문 말풍선은 paper 배경 + rule 테두리를 쓴다 — 액센트가 사용자 쪽으로 번지지 않는다', async () => {
    const onAsk = vi.fn();
    render(<ChatbotTab answer="" streaming={false} error={null} onAsk={onAsk} />);

    await userEvent.type(screen.getByLabelText('질문'), '정주사가 누구야');
    await userEvent.click(screen.getByRole('button', { name: '질문' }));

    const bubble = screen.getByText('정주사가 누구야');
    expect(bubble).toHaveClass('bg-brief-paper');
    expect(bubble).toHaveClass('border-brief-rule');
  });
});
