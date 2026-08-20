import { render, screen } from '@testing-library/react';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('숫자와 라벨을 렌더한다', () => {
    render(<StatCard value={3} label="읽는 중" />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('읽는 중')).toBeInTheDocument();
  });

  it('0도 그대로 표시한다 — 완독 판정 데이터가 없어 0이 정상값이다 (스펙 §7 #1)', () => {
    render(<StatCard value={0} label="완독" />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
