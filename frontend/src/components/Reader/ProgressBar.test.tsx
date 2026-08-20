import { render, screen } from '@testing-library/react';
import ProgressBar from './ProgressBar';

describe('ProgressBar', () => {
  it('FR-BRF-005 🚦: 서버가 내려준 percent 를 그대로 노출한다', () => {
    render(<ProgressBar percent={23.5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '23.5');
  });
});
