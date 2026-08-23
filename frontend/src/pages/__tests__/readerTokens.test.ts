import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config.js';

describe('읽기 화면 재설계 — 신규 토큰', () => {
  it('brief-page 배경 토큰이 시안 실측값과 일치한다', () => {
    const brief = (config.theme!.extend!.colors as Record<string, unknown>).brief as Record<
      string,
      string
    >;
    expect(brief.page).toBe('#f6f1e4');
  });
});
