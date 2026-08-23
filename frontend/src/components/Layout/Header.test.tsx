import { render, screen } from '@testing-library/react';
import Header from './Header';

describe('Header', () => {
  it('RE:ADD 로고를 표시한다', () => {
    render(<Header />);
    // 워드마크는 "ADD"만 <b>로 감싸 굵게 하므로 텍스트가 요소 둘로 쪼개진다 —
    // RTL 기본 매처는 노드 자신의 직계 텍스트만 보므로 textContent 로 찾는다.
    expect(screen.getByText((_, el) => el?.textContent === 'RE:ADD')).toBeInTheDocument();
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
    const brand = screen.getByText((_, el) => el?.textContent === 'RE:ADD');
    expect(brand.className).toContain('font-dashMono');
  });
});
