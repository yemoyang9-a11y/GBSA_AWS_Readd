import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * 관통 흐름 — CP3 정지선의 R4 책임 (대시보드 → 브리핑 → 읽기 → 싸비).
 *
 * 백엔드 엔드포인트가 아직 501 스텁이라 mocks/ 대역을 상대로 돈다. 따라서 이 테스트가
 * 증명하는 것은 **화면 연결과 라우팅**이지 서버 동작이 아니다 — 상한 게이트(자가 검증 1~14)는
 * 실제 API가 붙은 뒤 그쪽을 대상으로 따로 검증해야 한다.
 */
describe('관통 흐름 (mock 기준)', () => {
  // jsdom 은 파일 안에서 주소를 유지한다 — 앞 테스트가 남긴 경로에서 시작하지 않도록 되돌린다
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('대시보드에서 도서를 고르면 브리핑을 거쳐 읽기 화면까지 이어진다', async () => {
    render(<App />);

    // 대시보드 — 카탈로그가 뜨고 탁류가 기본 히어로다(2026-08-23 재설계)
    expect(await screen.findByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();

    // 미완비 도서를 미리보면 히어로가 바뀌고, 진입 버튼이 막혀 있다 (FR-BRW-002 🚦)
    await userEvent.click(screen.getByRole('button', { name: /검수 전 도서 선택/ }));
    expect(screen.getByRole('button', { name: '아직 준비 중입니다' })).toBeDisabled();

    // 다시 탁류를 미리보고 진입한다 → 서버(mock)가 briefing 으로 라우팅한다
    await userEvent.click(screen.getByRole('button', { name: /탁류 선택/ }));
    await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

    await waitFor(() => {
      expect(screen.getByRole('list', { name: '목차' })).toBeInTheDocument();
    });
    // 브리핑의 목차는 표시 전용이라 이동 요소가 없다 (FR-BRF-004, D12)
    expect(screen.getByRole('list', { name: '목차' }).querySelectorAll('a, button')).toHaveLength(
      0
    );

    // '이어서 읽기' → 읽기 화면
    await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

    expect(await screen.findByRole('article')).toHaveTextContent('미두장');

    // 읽기 화면에는 진도 바가 없고 페이지 번호만 있다 (FR-PRG-004)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText(/\d+ \/ 30/)).toBeInTheDocument();

    // 싸비는 닫힌 채로 들어온다 — 사용자가 top-bar 우측 토글을 눌러야 열린다
    expect(screen.queryByRole('tab', { name: '인물 관계도' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '싸비 열기' }));

    // 싸비 사이드창의 기본 탭은 인물 관계도다 (FR-SVB-002)
    expect(screen.getByRole('tab', { name: '인물 관계도' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
