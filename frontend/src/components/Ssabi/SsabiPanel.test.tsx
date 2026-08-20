import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SsabiPanel from './SsabiPanel';

const baseProps = {
  currentPage: 21,
  sessionEpoch: 7,
  onTabDataNeeded: () => {},
};

/**
 * 싸비 사이드창 (S5) — FR-SVB-002·003·004
 *
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

  it('탭을 고르면 그 탭이 선택된다', async () => {
    render(<SsabiPanel {...baseProps} />);

    await userEvent.click(screen.getByRole('tab', { name: '챗봇' }));

    expect(screen.getByRole('tab', { name: '챗봇' })).toHaveAttribute('aria-selected', 'true');
  });

  it('FR-SVB-004: 같은 세션이면(epoch 동일) 다시 그려도 보던 탭이 유지된다', async () => {
    const { rerender } = render(<SsabiPanel {...baseProps} />);
    await userEvent.click(screen.getByRole('tab', { name: '챗봇' }));

    rerender(<SsabiPanel {...baseProps} currentPage={22} />);

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

  it('FR-SVB-003: 페이지가 바뀌면 열려 있는 탭의 데이터를 다시 요청한다', () => {
    const onTabDataNeeded = vi.fn();
    const { rerender } = render(
      <SsabiPanel {...baseProps} onTabDataNeeded={onTabDataNeeded} />
    );
    onTabDataNeeded.mockClear();

    rerender(
      <SsabiPanel {...baseProps} currentPage={22} onTabDataNeeded={onTabDataNeeded} />
    );

    expect(onTabDataNeeded).toHaveBeenCalledWith('relationship', 22);
  });
});
