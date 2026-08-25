import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * 브리핑 스트리밍 폴백 (S6) — FR-BRF-003, FR-DAT-010, D13 ①
 *
 * 저장 리캡은 기준점이 완전히 일치할 때만 재사용된다 (R8). 진도가 움직이면 저장분이
 * 무효가 되어 `recap: null` 로 오고, 그때만 스트리밍 폴백을 부른다.
 */
describe('브리핑 스트리밍 폴백 (mock 기준)', () => {
  // jsdom 은 파일 안에서 주소를 유지한다 — 앞 테스트가 남긴 경로에서 시작하지 않도록 되돌린다
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it(
    '저장 리캡이 기준점과 맞으면 그대로 보여주고 폴백을 부르지 않는다',
    {
      timeout: 20000,
    },
    async () => {
      render(<App />);

      // 대시보드 재설계(2026-08-23) — 탁류는 기본 히어로라 미리보기 없이 바로 진입한다
      await screen.findByRole('heading', { level: 2, name: '탁류' }, { timeout: 5000 });
      await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));

      // 21페이지 진입 → K = 21, 저장분도 K = 21 이라 일치 → 저장 리캡 표시
      expect(
        await screen.findByText(/mock 저장 리캡/, undefined, { timeout: 5000 })
      ).toBeInTheDocument();
    }
  );

  it(
    '진도가 저장분과 어긋나면 폴백 스트림이 화면에 흘러 들어온다',
    {
      timeout: 30000,
    },
    async () => {
      render(<App />);

      // 먼저 읽기 화면에서 페이지를 넘겨 진도를 움직인다 (저장분 K = 21 과 어긋나게)
      // 대시보드 재설계(2026-08-23) — 탁류는 기본 히어로라 미리보기 없이 바로 진입한다
      await screen.findByRole('heading', { level: 2, name: '탁류' }, { timeout: 5000 });
      await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));
      await screen.findByRole('button', { name: '이어서 읽기' }, { timeout: 5000 });
      await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));
      await screen.findByRole('article', undefined, { timeout: 5000 });

      await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
      await waitFor(
        () => expect(screen.getByRole('textbox', { name: '페이지로 이동' })).toHaveValue('22'),
        { timeout: 5000 }
      );

      // 브리핑 화면으로 다시 들어간다 (pushState 만으로는 라우터가 반응하지 않아 popstate 를 함께 보낸다)
      window.history.pushState({}, '', '/books/takryu/briefing');
      window.dispatchEvent(new PopStateEvent('popstate'));

      // 저장분(K=21)과 현재 기준점(K=22)이 다르므로 recap: null → 폴백이 흘러 들어온다
      await waitFor(() => expect(screen.getByText(/mock 실시간 리캡/)).toBeInTheDocument(), {
        timeout: 10000,
      });
    }
  );
});
