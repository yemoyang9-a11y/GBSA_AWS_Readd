/**
 * 디자인 토큰 — 스펙 §3의 시안 실측값을 고정한다.
 *
 * 색 하나가 오타로 바뀌면 화면 전체 톤이 어긋나는데 눈으로는 잘 안 잡힌다.
 * 이 테스트가 스펙과 config 사이의 유일한 기계적 연결이다.
 */

import config from '../tailwind.config.js';

const colors = (config.theme?.extend?.colors ?? {}) as Record<string, any>;

describe('디자인 토큰 (스펙 §3)', () => {
  it('색 팔레트가 시안 실측값과 일치한다', () => {
    expect(colors.canvas).toBe('#faf8f5');
    expect(colors.surface).toBe('#ffffff');
    expect(colors.line.DEFAULT).toBe('#ebe6e0');
    expect(colors.line.subtle).toBe('#edeae6');
    expect(colors.ink).toBe('#1c1b1a');
    expect(colors.muted).toBe('#6e6a66');
    expect(colors.faint).toBe('#76726e');
    expect(colors.accent).toBe('#3b3db2');
    expect(colors.active).toBe('#111111');
  });

  it('서체는 명조·고딕 두 종이며 폴백을 갖는다', () => {
    const fonts = config.theme?.extend?.fontFamily as Record<string, string[]>;
    expect(fonts.serif[0]).toBe('"Nanum Myeongjo"');
    expect(fonts.serif).toContain('serif');
    expect(fonts.sans[0]).toBe('"Gothic A1"');
    expect(fonts.sans).toContain('sans-serif');
  });

  it('형태 토큰이 시안 실측값과 일치한다', () => {
    const t = config.theme?.extend as Record<string, any>;
    expect(t.borderRadius.card).toBe('16px');
    expect(t.borderRadius.cover).toBe('8px');
    expect(t.borderRadius.pill).toBe('20px');
    expect(t.boxShadow.card).toBe('0 8px 8px rgba(28, 27, 26, 0.03)');
    expect(t.width['book-card']).toBe('312px');
    expect(t.height.cover).toBe('240px');
    expect(t.height.navbar).toBe('80px');
    expect(t.spacing.card).toBe('18px');
    expect(t.spacing.gutter).toBe('24px');
  });
});
