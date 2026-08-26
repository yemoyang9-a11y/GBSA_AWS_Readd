import { render, screen } from '@testing-library/react';
import Header from './Header';

describe('Header', () => {
  it('RE:ADD 로고를 표시한다', () => {
    // 2026-08-26, 사용자 제공 로고로 콜론 자리를 북마크 SVG 마크로 바꿨다 — 텍스트
    // 노드에는 더 이상 ":"가 없다("READD"). 마크 자체는 별도로 확인한다.
    const { container } = render(<Header />);
    expect(screen.getByText((_, el) => el?.textContent === 'READD')).toBeInTheDocument();
    // clipPath id는 워드마크 북마크 SVG에만 있다 — 검색 버튼 아이콘과 구분해서 짚는다.
    expect(container.querySelector('#readd-mark-clip')).not.toBeNull();
  });

  it('도서 검색은 대응 엔드포인트가 없어 비활성이다 (스펙 §7 #3)', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: '도서 검색' })).toBeDisabled();
  });

  it('사람 이름이 들어간 서재 제목을 렌더하지 않는다 — 계정 개념이 없다 (team-sync §4.8)', () => {
    const { container } = render(<Header />);
    expect(container.textContent).not.toMatch(/님의 서재/);
  });

  it('부제 카피를 두지 않는다 (2026-08-22 사용자 결정)', () => {
    const { container } = render(<Header />);
    expect(container.textContent).not.toMatch(/나만의 페이스/);
  });

  it('워드마크가 DM Mono 서체를 쓴다 (2026-08-23 재설계)', () => {
    render(<Header />);
    const brand = screen.getByText((_, el) => el?.textContent === 'READD');
    expect(brand.className).toContain('font-dashMono');
  });
});
