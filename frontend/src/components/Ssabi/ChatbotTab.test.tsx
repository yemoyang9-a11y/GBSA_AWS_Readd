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

  it('본문에서 인용한 문장이 오면(quote) 입력창을 그 문장으로 채운다', () => {
    render(
      <ChatbotTab
        answer=""
        streaming={false}
        error={null}
        onAsk={() => {}}
        quote={{ text: '정 주사는 여전히 미두장 앞을', token: 1 }}
      />
    );

    expect(screen.getByLabelText('질문')).toHaveValue('"정 주사는 여전히 미두장 앞을" ');
  });

  it('같은 문장을 다시 인용해도(token 증가) 입력창을 새 인용문으로 다시 채운다', () => {
    const { rerender } = render(
      <ChatbotTab answer="" streaming={false} error={null} onAsk={() => {}} quote={{ text: '첫 인용', token: 1 }} />
    );
    expect(screen.getByLabelText('질문')).toHaveValue('"첫 인용" ');

    rerender(
      <ChatbotTab answer="" streaming={false} error={null} onAsk={() => {}} quote={{ text: '첫 인용', token: 2 }} />
    );

    expect(screen.getByLabelText('질문')).toHaveValue('"첫 인용" ');
  });
});

/**
 * 대화 이력 (2026-08-24, 사용자·R2 조율 결정) — turns가 오면 그 대화 전체를 그리고,
 * "새 채팅"·"지난 대화" 버튼과 이력 목록도 함께 노출한다.
 */
describe('ChatbotTab — 대화 이력', () => {
  it('turns가 오면 전체 문답을 화자별 배경으로 그린다', () => {
    render(
      <ChatbotTab
        streaming={false}
        error={null}
        onAsk={() => {}}
        turns={[
          { role: 'user', text: '정주사가 누구야' },
          { role: 'assistant', text: '고무신 장사입니다.' },
        ]}
        conversations={[]}
        onToggleHistory={() => {}}
        onNewChat={() => {}}
      />
    );

    expect(screen.getByText('정주사가 누구야')).toHaveClass('bg-canvas');
    expect(screen.getByText('고무신 장사입니다.')).toHaveClass('bg-ssabi-soft');
  });

  it('"새 채팅" 버튼을 누르면 onNewChat이 호출된다', async () => {
    const onNewChat = vi.fn();
    render(
      <ChatbotTab
        streaming={false}
        error={null}
        onAsk={() => {}}
        turns={[]}
        conversations={[]}
        onToggleHistory={() => {}}
        onNewChat={onNewChat}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '새 채팅' }));
    expect(onNewChat).toHaveBeenCalled();
  });

  it('"지난 대화"를 열면 목록을 보여주고, 선택하면 onSelectConversation이 호출된다', async () => {
    const onSelectConversation = vi.fn();
    render(
      <ChatbotTab
        streaming={false}
        error={null}
        onAsk={() => {}}
        turns={[]}
        conversations={[{ id: 42, conversation_date: '2026-08-24', title: '정주사가 누구야', created_at: '', updated_at: '' }]}
        historyOpen={true}
        onToggleHistory={() => {}}
        onNewChat={() => {}}
        onSelectConversation={onSelectConversation}
      />
    );

    await userEvent.click(screen.getByText('정주사가 누구야'));
    expect(onSelectConversation).toHaveBeenCalledWith(42);
  });
});
