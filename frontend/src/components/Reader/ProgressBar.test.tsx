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

  it('tone 기본값은 ink 다 — 대시보드 호출부가 영향받지 않는다', () => {
    render(<ProgressBar percent={70} />);
    expect(screen.getByTestId('progress-fill')).toHaveClass('bg-ink');
  });

  it('tone="accent" 면 채움이 accent 다 — 브리핑 시안', () => {
    render(<ProgressBar percent={70} tone="accent" />);
    expect(screen.getByTestId('progress-fill')).toHaveClass('bg-accent');
  });
});

describe('brief 톤·size (2026-08-23 브리핑 재설계)', () => {
  it('size="md"는 6px 높이(h-1.5)를 쓴다 — 기본은 4px(h-1) 그대로', () => {
    render(<ProgressBar percent={50} />);
    expect(screen.getByRole('progressbar').className).toContain('h-1 ');

    render(<ProgressBar percent={50} size="md" />);
    expect(screen.getAllByRole('progressbar')[1].className).toContain('h-1.5');
  });
});

describe('진도 바 채움색 통일 (2026-08-25, 대시보드·브리핑 시안 5종 비교 후 결정)', () => {
  it('tone="brief"는 progress 채움(대시보드와 통일)·brief-line 트랙을 쓴다', () => {
    render(<ProgressBar percent={50} tone="brief" />);
    expect(screen.getByTestId('progress-fill').className).toContain('bg-progress');
    expect(screen.getByRole('progressbar').className).toContain('bg-brief-line');
  });

  it('tone="dash"도 같은 progress 채움을 쓴다 — 트랙만 dash-line으로 구분된다', () => {
    render(<ProgressBar percent={50} tone="dash" />);
    expect(screen.getByTestId('progress-fill').className).toContain('bg-progress');
    expect(screen.getByRole('progressbar').className).toContain('bg-dash-line');
  });
});
