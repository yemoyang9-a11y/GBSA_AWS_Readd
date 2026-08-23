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

describe('size 변형 (대시보드 재설계, 2026-08-23)', () => {
  it('size 기본값은 card — 기존 렌더와 동일하다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" />);
    const cover = screen.getByTestId('typographic-cover');
    expect(cover.className).toContain('h-cover');
    expect(cover.className).not.toContain('h-hero-cover');
  });

  it('size="hero"는 h-hero-cover를 쓰고 대시보드 전용 둥근 모서리를 쓴다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" size="hero" />);
    const cover = screen.getByTestId('typographic-cover');
    expect(cover.className).toContain('h-hero-cover');
    expect(cover.className).toContain('rounded-dash-hero-cover');
    expect(cover.className).not.toContain('rounded-cover');
    expect(screen.getByText('탁류').className).toContain('font-dashSerif');
  });

  it('size="row"는 w-row-cover·h-row-cover 고정폭에 작은 둥근 모서리를 쓴다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" size="row" />);
    const cover = screen.getByTestId('typographic-cover');
    expect(cover.className).toContain('w-row-cover');
    expect(cover.className).toContain('h-row-cover');
    expect(cover.className).toContain('rounded-dash-row-cover');
    expect(screen.getByText('탁류').className).toContain('text-xs');
  });

  it('size="hero"에 coverUrl이 있으면 이미지가 h-hero-cover를 쓴다', () => {
    render(
      <TypographicCover title="탁류" author="채만식" coverUrl="https://x/y.jpg" size="hero" />
    );
    expect(screen.getByRole('img').className).toContain('h-hero-cover');
  });

  it('size="brief"는 168×230 고정 크기에 14px 라운드와 그림자를 쓴다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" size="brief" />);
    const cover = screen.getByTestId('typographic-cover');
    expect(cover.className).toContain('w-brief-cover');
    expect(cover.className).toContain('h-brief-cover');
    expect(cover.className).toContain('rounded-brief-panel');
    expect(cover.className).toContain('shadow-brief-soft');
    expect(screen.getByText('탁류').className).toContain('font-dashSerif');
  });

  it('size="brief"에 coverUrl이 있으면 이미지가 같은 크기·라운드·그림자를 쓴다', () => {
    render(
      <TypographicCover title="탁류" author="채만식" coverUrl="/covers/takryu.jpg" size="brief" />
    );
    const img = screen.getByRole('img');
    expect(img.className).toContain('w-brief-cover');
    expect(img.className).toContain('h-brief-cover');
    expect(img.className).toContain('rounded-brief-panel');
    expect(img.className).toContain('shadow-brief-soft');
  });
});
