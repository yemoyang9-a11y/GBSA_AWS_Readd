import { render, screen } from '@testing-library/react';
import RecapTab from './RecapTab';

/**
 * critique P2 (2026-08-21): 리캡 본문은 이 탭에서 독자가 실제로 찾는 콘텐츠이므로
 * muted(캡션·저자명과 같은 무게)가 아니라 ink로 강조한다.
 */
describe('RecapTab', () => {
  it('본문은 ink로 강조하고, muted로 저평가하지 않는다', () => {
    render(<RecapTab text="정 주사는 미두장에서 재산을 잃었다." streaming={false} failed={false} />);
    const body = screen.getByText(/정 주사는/);
    expect(body).toHaveClass('text-ink');
    expect(body).not.toHaveClass('text-muted');
  });

  it('스트리밍 표시는 여전히 보조 색(faint)을 쓴다', () => {
    render(<RecapTab text="정 주사는" streaming={true} failed={false} />);
    expect(screen.getByText('불러오는 중')).toHaveClass('text-faint');
  });
});
