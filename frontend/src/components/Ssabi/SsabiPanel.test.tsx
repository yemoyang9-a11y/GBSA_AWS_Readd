import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SsabiPanel from './SsabiPanel';
import type { GraphResponse } from '../../types';

const graph: GraphResponse = {
  nodes: [{ id: 'jeong', name: '정주사', first_appearance_page: 1, aliases: ['정 주사'] }],
  edges: [],
};

const baseProps = {
  sessionEpoch: 7,
  onTabChange: () => {},
  graph,
  graphFailed: false,
  recapText: '',
  recapStreaming: false,
  recapFailed: false,
  chatTurns: [],
  chatStreaming: false,
  chatError: null,
  chatConversations: [],
  chatHistoryOpen: false,
  onAsk: () => {},
  onNewChat: () => {},
  onToggleChatHistory: () => {},
  onSelectChatConversation: () => {},
};

/**
 * 싸비 사이드창 (S5) — FR-SVB-002·004·005
 *
 * 탭 상태만 이 컴포넌트가 갖는다. 데이터 조회는 컨테이너가 useSsabiData 로 하고,
 * 페이지 변경 시 재조회(FR-SVB-003)도 그쪽 책임이다.
 * 세션 경계는 서버가 준 session_epoch 의 변화로만 판정한다 (자가 검증 17번).
 */
describe('싸비 사이드창', () => {
  it('FR-SVB-002: 최초 열기의 기본 탭은 인물 관계도다', () => {
    render(<SsabiPanel {...baseProps} />);
    expect(screen.getByRole('tab', { name: '인물 관계도' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('열린 탭에 받은 데이터를 보여준다', () => {
    render(<SsabiPanel {...baseProps} />);
    // 이름은 그래프 노드와 인물 카드 양쪽에 나온다 — 인물 영역으로 좁힌다
    const people = screen.getByRole('region', { name: '인물' });
    expect(within(people).getByText(/정주사/)).toBeInTheDocument();
  });

  it('탭을 고르면 그 탭이 선택된다', async () => {
    render(<SsabiPanel {...baseProps} />);

    await userEvent.click(screen.getByRole('tab', { name: '챗봇' }));

    expect(screen.getByRole('tab', { name: '챗봇' })).toHaveAttribute('aria-selected', 'true');
  });

  it('탭이 바뀌면 어느 탭이 열렸는지 알린다 — 컨테이너가 그 탭 데이터를 조회한다', async () => {
    const onTabChange = vi.fn();
    render(<SsabiPanel {...baseProps} onTabChange={onTabChange} />);
    onTabChange.mockClear();

    await userEvent.click(screen.getByRole('tab', { name: '리캡' }));

    expect(onTabChange).toHaveBeenCalledWith('recap');
  });

  it('FR-SVB-004: 같은 세션이면(epoch 동일) 다시 그려도 보던 탭이 유지된다', async () => {
    const { rerender } = render(<SsabiPanel {...baseProps} />);
    await userEvent.click(screen.getByRole('tab', { name: '챗봇' }));

    rerender(<SsabiPanel {...baseProps} recapText="갱신" />);

    expect(screen.getByRole('tab', { name: '챗봇' })).toHaveAttribute('aria-selected', 'true');
  });

  it('FR-SVB-004: epoch 이 바뀌면 새 세션이므로 기본 탭으로 돌아간다', async () => {
    const { rerender } = render(<SsabiPanel {...baseProps} />);
    await userEvent.click(screen.getByRole('tab', { name: '챗봇' }));

    rerender(<SsabiPanel {...baseProps} sessionEpoch={8} />);

    expect(screen.getByRole('tab', { name: '인물 관계도' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('G8: 탭은 3개다 — 시안의 타임라인 탭은 만들지 않는다 (00-shared §2.5 "[이후 확장]")', () => {
    render(<SsabiPanel {...baseProps} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.textContent)).toEqual(['리캡', '인물 관계도', '챗봇']);
    expect(screen.queryByRole('tab', { name: '타임라인' })).not.toBeInTheDocument();
  });

  it('FR-SPL-005 🚦: 관계도 조회가 실패하면 부분 표시로 넘어가지 않는다', () => {
    render(<SsabiPanel {...baseProps} graph={null} graphFailed={true} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/정주사/)).not.toBeInTheDocument();
  });

  it('critique P1: 확인된 기준점이 있으면 헤더에 "Np까지 확인" 배지를 보여준다', () => {
    render(<SsabiPanel {...baseProps} appliedCutoff={79} />);
    expect(screen.getByText('79p까지 확인')).toBeInTheDocument();
  });

  it('critique P1: 아직 아무 스트림도 확인해 주지 않았으면(null) 배지를 그리지 않는다', () => {
    render(<SsabiPanel {...baseProps} />);
    expect(screen.queryByText(/까지 확인/)).not.toBeInTheDocument();
  });

  it('polish: 헤더가 여닫기 버튼(Reader가 그리는 고정 위치, size-9)과 겹치지 않을 오른쪽 여백을 확보한다', () => {
    render(<SsabiPanel {...baseProps} appliedCutoff={79} />);
    // 실측(브라우저): 배지 오른쪽 끝이 버튼 왼쪽 끝과 정확히 같은 x좌표에서 겹쳤다 — pr-20으로 고쳤다.
    expect(screen.getByText('아모의 가이드북').parentElement).toHaveClass('pr-20');
  });

  it('활성 탭은 brief-accent 테두리·배경을 쓴다', () => {
    render(<SsabiPanel {...baseProps} />);
    const activeTab = screen.getByRole('tab', { name: '인물 관계도' });
    expect(activeTab.className).toContain('border-brief-accent');
    expect(activeTab.className).toContain('bg-brief-accent-soft');
  });

  it('기준점 배지는 brief-accent 톤을 쓴다', () => {
    render(<SsabiPanel {...baseProps} appliedCutoff={79} />);
    expect(screen.getByText('79p까지 확인').className).toContain('text-brief-accent');
  });

  it('본문에서 인용 요청이 오면(pendingQuote) 다른 탭을 보고 있어도 챗봇 탭으로 전환한다', () => {
    const { rerender } = render(<SsabiPanel {...baseProps} />);
    // 기본은 인물 관계도 탭
    expect(screen.getByRole('tab', { name: '인물 관계도' })).toHaveAttribute('aria-selected', 'true');

    rerender(<SsabiPanel {...baseProps} pendingQuote={{ text: '정 주사', token: 1 }} />);

    expect(screen.getByRole('tab', { name: '챗봇' })).toHaveAttribute('aria-selected', 'true');
  });

  it('같은 문장을 연달아 다시 인용해도(token 증가) 챗봇 탭으로 매번 전환한다', async () => {
    const { rerender } = render(
      <SsabiPanel {...baseProps} pendingQuote={{ text: '정 주사', token: 1 }} />
    );
    await userEvent.click(screen.getByRole('tab', { name: '리캡' }));
    expect(screen.getByRole('tab', { name: '리캡' })).toHaveAttribute('aria-selected', 'true');

    rerender(<SsabiPanel {...baseProps} pendingQuote={{ text: '정 주사', token: 2 }} />);

    expect(screen.getByRole('tab', { name: '챗봇' })).toHaveAttribute('aria-selected', 'true');
  });
});
