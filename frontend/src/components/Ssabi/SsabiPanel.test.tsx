import { render, screen } from '@testing-library/react';
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
  chatAnswer: '',
  chatStreaming: false,
  chatError: null,
  onAsk: () => {},
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
    expect(screen.getByText(/정주사/)).toBeInTheDocument();
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

  it('FR-SPL-005 🚦: 관계도 조회가 실패하면 부분 표시로 넘어가지 않는다', () => {
    render(<SsabiPanel {...baseProps} graph={null} graphFailed={true} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/정주사/)).not.toBeInTheDocument();
  });
});
