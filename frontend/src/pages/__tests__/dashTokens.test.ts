import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config.js';

describe('대시보드 재설계 — 신규 토큰', () => {
  it('dash 색 토큰 4종이 시안 실측값과 일치한다', () => {
    const dash = (config.theme!.extend!.colors as Record<string, unknown>).dash as Record<
      string,
      string
    >;
    expect(dash.ink).toBe('#1f1f1f');
    expect(dash.muted).toBe('#777777');
    expect(dash.line).toBe('#dedede');
    expect(dash.paper).toBe('#fbf9f7');
  });

  it('dash 서체 토큰 3종이 있다', () => {
    const fonts = config.theme!.extend!.fontFamily as Record<string, string[]>;
    expect(fonts.dashSerif).toEqual(['"Noto Serif KR"', 'serif']);
    expect(fonts.dashSans).toEqual(['Pretendard', 'system-ui', 'sans-serif']);
    expect(fonts.dashMono).toEqual(['"DM Mono"', 'monospace']);
  });

  it('히어로·목록 표지 크기 토큰이 있다', () => {
    const height = config.theme!.extend!.height as Record<string, string>;
    const width = config.theme!.extend!.width as Record<string, string>;
    expect(height['hero-cover']).toBe('219px');
    expect(height['row-cover']).toBe('118px');
    expect(width['row-cover']).toBe('84px');
  });
});
