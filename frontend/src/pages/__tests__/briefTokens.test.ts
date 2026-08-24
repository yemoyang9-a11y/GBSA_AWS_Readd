import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config.js';

describe('브리핑 재설계 — 신규 토큰', () => {
  it('brief 색 토큰 — "황토색 느낌" 피드백(2026-08-24)으로 시안 실측값보다 밝고 채도 낮게 조정됐다', () => {
    const brief = (config.theme!.extend!.colors as Record<string, unknown>).brief as Record<
      string,
      string
    >;
    expect(brief.paper).toBe('#fdfdfa');
    expect(brief.ink).toBe('#272623');
    expect(brief.muted).toBe('#86847c');
    expect(brief.line).toBe('#ebe8e1');
    expect(brief.rule).toBe('#e4e0d5');
    expect(brief.accent).toBe('#4b3fd6');
    expect(brief['accent-soft']).toBe('#f1effc');
  });

  it('brief 라운드·그림자·표지 크기 토큰이 있다', () => {
    const radius = config.theme!.extend!.borderRadius as Record<string, string>;
    const shadow = config.theme!.extend!.boxShadow as Record<string, string>;
    const height = config.theme!.extend!.height as Record<string, string>;
    const width = config.theme!.extend!.width as Record<string, string>;
    expect(radius['brief-panel']).toBe('14px');
    expect(radius['brief-card']).toBe('10px');
    expect(shadow['brief-soft']).toBe(
      '0 10px 24px rgba(42, 38, 32, 0.07), 0 2px 6px rgba(42, 38, 32, 0.05)'
    );
    expect(shadow['brief-soft-sm']).toBe('0 4px 10px rgba(42, 38, 32, 0.08)');
    expect(height['brief-cover']).toBe('230px');
    expect(width['brief-cover']).toBe('168px');
  });
});
