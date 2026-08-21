import { render, screen } from '@testing-library/react';
import TypographicCover from './TypographicCover';

describe('TypographicCover', () => {
  it('cover_url 이 있으면 이미지를 쓴다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="/covers/takryu.jpg" />);
    const img = screen.getByRole('img', { name: '탁류 표지' });
    expect(img).toHaveAttribute('src', '/covers/takryu.jpg');
  });

  it('cover_url 이 없으면 제목·저자를 조판한 표지를 그린다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl={null} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('탁류')).toBeInTheDocument();
    expect(screen.getByText('채만식')).toBeInTheDocument();
  });

  it('cover_url 이 빈 문자열이어도 조판 표지로 떨어진다 — mock·실데이터 모두 빈 값이다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('탁류')).toBeInTheDocument();
  });

  it('coverUrl 을 아예 넘기지 않아도 동작한다', () => {
    render(<TypographicCover title="탁류" author="채만식" />);
    expect(screen.getByText('탁류')).toBeInTheDocument();
  });
});
