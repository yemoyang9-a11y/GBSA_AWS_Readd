import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * 싸비 데이터 연결 — mock 대역 기준.
 *
 * ⚠️ 이 테스트가 증명하는 것은 **화면이 조회 결과를 따라 바뀌는가**이지 서버의 상한 강제가
 * 아니다. 상한 게이트(자가 검증 1~14번)는 실제 API를 대상으로 따로 검증해야 한다 —
 * 내가 만든 대역을 상대로 검증하면 mock 이 내 기대와 같은지만 확인하게 된다.
 */

/** 대시보드 → 브리핑 → 읽기 화면까지 이동한다. 싸비 패널은 닫힌 상태로 시작한다 */
async function goToReader() {
  render(<App />);
  // 대시보드 재설계(2026-08-23) — 탁류는 기본 히어로라 미리보기 없이 바로 진입한다
  await screen.findByRole('heading', { level: 2, name: '탁류' }, { timeout: 5000 });
  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));
  await screen.findByRole('button', { name: '이어서 읽기' }, { timeout: 5000 });
  await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));
  await screen.findByRole('article', undefined, { timeout: 5000 });
}

/** 읽기 화면까지 이동한 뒤 싸비 패널을 연다 — 싸비 동작을 보는 테스트는 이쪽을 쓴다 */
async function goToReaderWithSsabi() {
  await goToReader();
  await userEvent.click(screen.getByRole('button', { name: '싸비 열기' }));
}

describe('싸비 데이터 연결 (mock 기준)', () => {
  // jsdom 은 파일 안에서 주소를 유지한다 — 앞 테스트가 남긴 경로에서 시작하지 않도록 되돌린다
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('페이지를 넘기면 열려 있는 관계도 탭이 새 기준점으로 다시 조회된다', { timeout: 20000 }, async () => {
    await goToReaderWithSsabi();

    // 21페이지 진입 → K = 20. 22페이지에서 처음 나오는 고태수는 아직 안 보인다.
    await waitFor(() => expect(screen.getByRole('heading', { name: /^인물/ })).toBeInTheDocument());
    expect(screen.queryByText(/고태수/)).not.toBeInTheDocument();

    // 페이지를 넘기면 K 가 올라가고, 열려 있는 탭이 재조회된다 (FR-SVB-003)
    for (const expected of ['22', '23', '24']) {
      await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
      await waitFor(
        () => expect(screen.getByRole('textbox', { name: '페이지로 이동' })).toHaveValue(expected),
        { timeout: 5000 }
      );
    }

    // 인물 목록과 관계 목록 양쪽에 나오므로 복수로 받는다
    await waitFor(() => expect(screen.getAllByText(/고태수/).length).toBeGreaterThan(0));
  });

  it('싸비 토글로 패널을 열고 닫는다 — 기본은 닫힘', { timeout: 20000 }, async () => {
    await goToReader();

    // 읽기 화면에 들어오면 본문만 보인다. 싸비는 사용자가 눌러야 열린다
    expect(screen.queryByRole('tab', { name: '인물 관계도' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '싸비 열기' }));
    expect(screen.getByRole('tab', { name: '인물 관계도' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '싸비 닫기' }));
    // 숨기는 게 아니라 언마운트한다 — 닫힌 패널이 리캡 스트리밍을 계속 내보내면
    // 그대로 LLM 재호출이고 분당 3회 상한에 걸린다 (NFR-AI-017). 다만 슬라이드
    // 애니메이션(usePanelOpenTransition, 260ms) 동안은 잠깐 더 마운트돼 있다가
    // 사라지므로 즉시가 아니라 waitFor로 확인한다.
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: '인물 관계도' })).not.toBeInTheDocument()
    );
  });

  it('챗봇 탭에서 질문하면 답변이 스트리밍으로 들어온다', { timeout: 20000 }, async () => {
    await goToReaderWithSsabi();
    await userEvent.click(screen.getByRole('tab', { name: '챗봇' }));

    await userEvent.type(screen.getByLabelText('질문'), '정주사는 어떤 사람인가', { delay: null });
    await userEvent.click(screen.getByRole('button', { name: '질문 보내기' }));

    await waitFor(() => expect(screen.getByText(/정주사에 대해/)).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('근거 밖 질문에는 서버가 준 통일 문구가 그대로 렌더된다 (FR-QNA-004 🚦)', { timeout: 20000 }, async () => {
    await goToReaderWithSsabi();
    await userEvent.click(screen.getByRole('tab', { name: '챗봇' }));

    await userEvent.type(screen.getByLabelText('질문'), '결말이 어떻게 되나', { delay: null });
    await userEvent.click(screen.getByRole('button', { name: '질문 보내기' }));

    // 거절도 일반 답변과 똑같은 자리에 똑같이 렌더된다 — 프론트가 구분하지 않는다
    await waitFor(
      () => expect(screen.getByText(/알 수 없는 내용입니다/)).toBeInTheDocument(),
      { timeout: 3000 }
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
