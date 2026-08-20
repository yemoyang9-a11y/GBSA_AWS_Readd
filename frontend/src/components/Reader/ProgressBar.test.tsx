import { render, screen } from '@testing-library/react';
import ProgressBar from './ProgressBar';

describe('ProgressBar', () => {
  it('FR-BRF-005 🚦: 서버가 내려준 percent 를 그대로 노출한다', () => {
    render(<ProgressBar percent={23.5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '23.5');
  });

  it('채움 폭이 percent 와 일치한다 — 프론트가 값을 다시 계산하지 않는다', () => {
    render(<ProgressBar percent={64} />);
    const fill = screen.getByTestId('progress-fill');
    expect(fill).toHaveStyle({ width: '64%' });
  });

  it('접근성 범위(0~100)와 이름을 갖는다', () => {
    render(<ProgressBar percent={0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('percent 가 100을 넘어도 막대가 넘치지 않는다', () => {
    render(<ProgressBar percent={130} />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '100%' });
    // 표시만 자른다 — aria 값은 서버가 준 값 그대로다 (절대 규칙 2번)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '130');
  });
});
