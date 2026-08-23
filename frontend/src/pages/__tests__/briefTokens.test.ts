import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config.js';

describe('브리핑 재설계 — 신규 토큰', () => {
  it('brief 색 토큰이 시안 실측값과 일치한다', () => {
    const brief = (config.theme!.extend!.colors as Record<string, unknown>).brief as Record<
      string,
      string
    >;
    expect(brief.paper).toBe('#fbf8f2');
    expect(brief.ink).toBe('#2a2620');
    expect(brief.muted).toBe('#8c8473');
    expect(brief.line).toBe('#ece6d8');
    expect(brief.rule).toBe('#d3c6a8');
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
