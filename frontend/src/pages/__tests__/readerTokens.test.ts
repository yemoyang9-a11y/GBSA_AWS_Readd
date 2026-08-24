import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config.js';

describe('읽기 화면 재설계 — 신규 토큰', () => {
  it('brief-page 배경 토큰이 brief-paper와 통일돼 있다 (2026-08-24 사용자 피드백 — 시안 실측값 #f6f1e4는 topbar/패널과 두 톤으로 갈라져 보여 paper로 통일)', () => {
    const brief = (config.theme!.extend!.colors as Record<string, unknown>).brief as Record<
      string,
      string
    >;
    expect(brief.page).toBe(brief.paper);
  });
});
