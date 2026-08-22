import { render, screen } from '@testing-library/react';
import Header from './Header';

describe('Header', () => {
  it('RE:ADD 로고를 표시한다', () => {
    render(<Header />);
    expect(screen.getByText('RE:ADD')).toBeInTheDocument();
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
});
