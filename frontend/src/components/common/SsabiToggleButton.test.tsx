import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SsabiToggleButton from './SsabiToggleButton';

describe('SsabiToggleButton', () => {
  it('닫혀 있으면 "싸비 열기"라는 이름을 갖는다', () => {
    render(<SsabiToggleButton open={false} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: '싸비 열기' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('열려 있으면 "싸비 닫기"라는 이름을 갖고 강조 테두리를 쓴다', () => {
    render(<SsabiToggleButton open={true} onToggle={() => {}} />);
    const button = screen.getByRole('button', { name: '싸비 닫기' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button.className).toContain('border-brief-ink');
  });

  it('누르면 onToggle이 호출된다', async () => {
    const onToggle = vi.fn();
    render(<SsabiToggleButton open={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: '싸비 열기' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
