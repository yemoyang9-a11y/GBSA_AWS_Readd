import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatbotTab from './ChatbotTab';

describe('ChatbotTab', () => {
  it('싸비 답변 말풍선은 progress(남색) 테두리를 쓰고 옆에 마스코트 아바타 이미지가 있다', () => {
    // 2026-08-25: brief-accent(남보라)에서 progress(남색, 진도 바와 통일)로 변경
    const { container } = render(
      <ChatbotTab answer="정 주사에 대해 답합니다." streaming={false} error={null} onAsk={() => {}} />
    );
    expect(screen.getByText(/정 주사에 대해/)).toHaveClass('border-progress');
    // Vite가 빌드마다 파일명에 해시를 붙이므로(캐시 버스팅, 2026-08-25) 정확한 경로 대신
    // 파일명만 확인한다.
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/ssabi-face/);
  });

  it('2026-08-24: 대화가 없으면(질문 전) 기본 인사 멘트를 보여준다 — 빈 말풍선은 아니다', () => {
    render(<ChatbotTab answer="" streaming={false} error={null} onAsk={() => {}} />);
    expect(
      screen.getByText('안녕하세요, 아모예요. 지금까지 읽은 내용 안에서 궁금한 걸 물어보세요.')
    ).toBeInTheDocument();
  });

  it('turns가 빈 배열이면(새 채팅 직후) 기본 인사 멘트를 보여준다', () => {
    render(
      <ChatbotTab
        streaming={false}
        error={null}
        onAsk={() => {}}
        turns={[]}
        conversations={[]}
        onToggleHistory={() => {}}
        onNewChat={() => {}}
      />
    );
    expect(
      screen.getByText('안녕하세요, 아모예요. 지금까지 읽은 내용 안에서 궁금한 걸 물어보세요.')
    ).toBeInTheDocument();
  });

  it('대화가 시작되면(turns 존재) 기본 인사 멘트는 사라진다', () => {
    render(
      <ChatbotTab
        streaming={false}
        error={null}
        onAsk={() => {}}
        turns={[{ role: 'user', text: '정주사가 누구야' }]}
        conversations={[]}
        onToggleHistory={() => {}}
        onNewChat={() => {}}
      />
    );
    expect(
      screen.queryByText('안녕하세요, 아모예요. 지금까지 읽은 내용 안에서 궁금한 걸 물어보세요.')
    ).not.toBeInTheDocument();
  });

  it('사용자 질문 말풍선은 paper 배경 + rule 테두리를 쓴다 — 액센트가 사용자 쪽으로 번지지 않는다', async () => {
    const onAsk = vi.fn();
    render(<ChatbotTab answer="" streaming={false} error={null} onAsk={onAsk} />);

    await userEvent.type(screen.getByLabelText('질문'), '정주사가 누구야');
    await userEvent.click(screen.getByRole('button', { name: '질문 보내기' }));

    const bubble = screen.getByText('정주사가 누구야');
    expect(bubble).toHaveClass('bg-brief-paper');
    expect(bubble).toHaveClass('border-brief-rule');
  });

  it('2026-08-25: 본문에서 인용한 문장이 오면(quote) "선택한 문장" 카드로만 보여주고 입력창은 비워 둔다', () => {
    render(
      <ChatbotTab
        answer=""
        streaming={false}
        error={null}
        onAsk={() => {}}
        quote={{ text: '정 주사는 여전히 미두장 앞을', token: 1 }}
      />
    );

    expect(screen.getByText('정 주사는 여전히 미두장 앞을', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('질문')).toHaveValue('');
  });

  it('2026-08-25: 인용된 상태에서 직접 타이핑한 질문을 보내면 인용문이 조용히 같이 딸려간다', async () => {
    const onAsk = vi.fn();
    render(
      <ChatbotTab
        answer=""
        streaming={false}
        error={null}
        onAsk={onAsk}
        quote={{ text: '정 주사는 여전히 미두장 앞을', token: 1 }}
      />
    );

    await userEvent.type(screen.getByLabelText('질문'), '이 사람 누구야');
    await userEvent.click(screen.getByRole('button', { name: '질문 보내기' }));

    expect(onAsk).toHaveBeenCalledWith('이 사람 누구야', '정 주사는 여전히 미두장 앞을');
  });

  it('2026-08-25: "선택한 문장" 카드의 ×를 누르면 카드가 사라지고, 그 뒤 질문에는 인용이 딸려가지 않는다', async () => {
    const onAsk = vi.fn();
    render(
      <ChatbotTab
        answer=""
        streaming={false}
        error={null}
        onAsk={onAsk}
        quote={{ text: '정 주사는 여전히 미두장 앞을', token: 1 }}
      />
    );

    expect(screen.getByText('선택한 문장')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '선택한 문장 해제' }));

    expect(screen.queryByText('선택한 문장')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('질문'), '이 사람 누구야');
    await userEvent.click(screen.getByRole('button', { name: '질문 보내기' }));
    expect(onAsk).toHaveBeenCalledWith('이 사람 누구야', undefined);
  });

  it('다른 문장을 다시 인용하면(token 증가) "선택한 문장" 카드를 새 인용문으로 갈아 끼운다', () => {
    const { rerender } = render(
      <ChatbotTab answer="" streaming={false} error={null} onAsk={() => {}} quote={{ text: '첫 인용', token: 1 }} />
    );
    expect(screen.getByText('첫 인용', { exact: false })).toBeInTheDocument();

    rerender(
      <ChatbotTab answer="" streaming={false} error={null} onAsk={() => {}} quote={{ text: '두 번째 인용', token: 2 }} />
    );

    expect(screen.getByText('두 번째 인용', { exact: false })).toBeInTheDocument();
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

    expect(screen.getByText('정주사가 누구야')).toHaveClass('bg-brief-paper');
    expect(screen.getByText('고무신 장사입니다.')).toHaveClass('bg-white', 'border-progress');
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

  it('2026-08-25: 대화 항목의 삭제 버튼을 누르면 onDeleteConversation만 호출되고 onSelectConversation은 호출되지 않는다', async () => {
    const onSelectConversation = vi.fn();
    const onDeleteConversation = vi.fn();
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
        onDeleteConversation={onDeleteConversation}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '대화 삭제' }));

    expect(onDeleteConversation).toHaveBeenCalledWith(42);
    expect(onSelectConversation).not.toHaveBeenCalled();
  });

  it('2026-08-25: conversation_date에 타임스탬프가 섞여 와도 날짜만 보여준다', () => {
    render(
      <ChatbotTab
        streaming={false}
        error={null}
        onAsk={() => {}}
        turns={[]}
        conversations={[
          {
            id: 42,
            conversation_date: '2026-08-25T00:00:00.000Z',
            title: '정주사가 누구야',
            created_at: '',
            updated_at: '',
          },
        ]}
        historyOpen={true}
        onToggleHistory={() => {}}
        onNewChat={() => {}}
      />
    );

    expect(screen.getByText('2026-08-25')).toBeInTheDocument();
    expect(screen.queryByText('2026-08-25T00:00:00.000Z')).not.toBeInTheDocument();
  });
});
