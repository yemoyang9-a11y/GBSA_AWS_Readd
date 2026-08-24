import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * '이어서 읽기' 회귀 (UC-28, FR-PRG-003 🚦)
 *
 * 브리핑에서 읽기 화면으로 넘어갈 때 읽던 위치를 잃으면, 프론트가 1페이지로 진도 이벤트를
 * 보내 기준점이 뒤로 밀린다. 기준점은 앞뒤 모두 따라 움직이므로(R1 불변식) 이건 곧
 * "읽은 데까지"가 통째로 되감기는 사고다.
 */
describe("'이어서 읽기'로 읽기 화면에 들어갈 때", () => {
  // jsdom 은 파일 안에서 주소를 유지한다 — 앞 테스트가 남긴 경로에서 시작하지 않도록 되돌린다
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('읽던 페이지에서 이어 읽는다 — 1페이지로 되감지 않는다', { timeout: 20000 }, async () => {
    render(<App />);

    // 대시보드 재설계(2026-08-23) — 탁류는 기본 히어로라 미리보기 없이 바로 진입한다
    await screen.findByRole('heading', { level: 2, name: '탁류' }, { timeout: 5000 });
    await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

    await screen.findByRole('button', { name: '이어서 읽기' }, { timeout: 5000 });
    await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

    await screen.findByRole('article', undefined, { timeout: 5000 });
    expect(screen.getByRole('textbox', { name: '페이지로 이동' })).toHaveValue('21');
  });

  it('URL 로 바로 읽기 화면에 들어와도 서버 진입 판정이 알려준 페이지에서 시작한다', {
    timeout: 20000,
  }, async () => {
    window.history.pushState({}, '', '/books/takryu/read');

    render(<App />);

    await screen.findByRole('article', undefined, { timeout: 5000 });
    // 클라이언트가 1페이지로 가정하지 않는다 — 판정은 서버 몫이다 (절대 규칙 8번)
    expect(screen.getByRole('textbox', { name: '페이지로 이동' })).toHaveValue('21');
  });
});
