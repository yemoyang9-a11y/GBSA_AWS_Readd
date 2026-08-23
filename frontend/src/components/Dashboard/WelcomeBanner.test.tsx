import { render, screen } from '@testing-library/react';
import WelcomeBanner from './WelcomeBanner';

describe('WelcomeBanner', () => {
  it('eyebrow와 인사말을 렌더한다', () => {
    render(<WelcomeBanner />);
    expect(screen.getByText('MY READING ROOM')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: '오늘도, 이야기 속으로.' })
    ).toBeInTheDocument();
  });
});
