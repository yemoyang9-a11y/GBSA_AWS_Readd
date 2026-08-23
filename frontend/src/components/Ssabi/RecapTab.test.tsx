import { render, screen } from '@testing-library/react';
import RecapTab from './RecapTab';

describe('RecapTab', () => {
  it('본문은 brief-ink로 강조하고, brief-muted로 저평가하지 않는다', () => {
    render(<RecapTab text="정 주사는 미두장에서 재산을 잃었다." streaming={false} failed={false} />);
    const body = screen.getByText(/정 주사는/);
    expect(body).toHaveClass('text-brief-ink');
    expect(body).not.toHaveClass('text-brief-muted');
  });

  it('스트리밍 표시는 brief-muted를 쓴다', () => {
    render(<RecapTab text="정 주사는" streaming={true} failed={false} />);
    expect(screen.getByText('불러오는 중')).toHaveClass('text-brief-muted');
  });

  it('"지금까지" eyebrow 라벨과 장식용 인용부호를 보여준다', () => {
    render(<RecapTab text="정 주사는" streaming={false} failed={false} />);
    expect(screen.getByText('지금까지')).toBeInTheDocument();
    expect(screen.getByText('"', { exact: true })).toBeInTheDocument();
  });
});
