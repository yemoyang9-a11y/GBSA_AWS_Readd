/**
 * 디자인 토큰 — 스펙 §3의 시안 실측값을 고정한다.
 *
 * 색 하나가 오타로 바뀌면 화면 전체 톤이 어긋나는데 눈으로는 잘 안 잡힌다.
 * 이 테스트가 스펙과 config 사이의 유일한 기계적 연결이다.
 */

import config from '../tailwind.config.js';

/**
 * `Config['theme']['extend']` 는 Tailwind 쪽에서 매우 느슨하게 선언돼 있어 그대로 읽으면
 * 인덱싱마다 타입이 풀린다. 이 테스트가 실제로 단언하는 모양만 좁게 적어 두고 그걸로 읽는다 —
 * 토큰이 사라지거나 이름이 바뀌면 테스트 실패 이전에 tsc 가 먼저 잡는다.
 */
interface ExtendTokens {
  colors: {
    canvas: string;
    surface: string;
    line: { DEFAULT: string; subtle: string };
    ink: string;
    muted: string;
    faint: string;
    accent: string;
    active: string;
    ssabi: { DEFAULT: string; soft: string };
  };
  fontFamily: Record<string, string[]>;
  borderRadius: Record<string, string>;
  boxShadow: Record<string, string>;
  spacing: Record<string, string>;
  width: Record<string, string>;
  height: Record<string, string>;
}

const extend = config.theme?.extend as unknown as ExtendTokens;
const colors = extend.colors;

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

  it('싸비 강조색은 accent 와 별개 계열이다 — 시안이 두 색을 구분해 쓴다', () => {
    expect(colors.ssabi.DEFAULT).toBe('#c86b3d');
    expect(colors.ssabi.soft).toBe('#fdf6f0');
    // 한 토큰으로 묶으면 진도·통계와 싸비 UI 가 함께 움직인다
    expect(colors.ssabi.DEFAULT).not.toBe(colors.accent);
  });

  it('서체는 명조·고딕 두 종이며 폴백을 갖는다', () => {
    const fonts = extend.fontFamily;
    expect(fonts.serif[0]).toBe('"Nanum Myeongjo"');
    expect(fonts.serif).toContain('serif');
    expect(fonts.sans[0]).toBe('"Gothic A1"');
    expect(fonts.sans).toContain('sans-serif');
  });

  it('형태 토큰이 시안 실측값과 일치한다', () => {
    expect(extend.borderRadius.card).toBe('16px');
    expect(extend.borderRadius.cover).toBe('8px');
    expect(extend.borderRadius.pill).toBe('20px');
    expect(extend.boxShadow.card).toBe('0 8px 8px rgba(28, 27, 26, 0.03)');
    expect(extend.width['book-card']).toBe('312px');
    expect(extend.height.cover).toBe('240px');
    expect(extend.height.navbar).toBe('80px');
    expect(extend.spacing.card).toBe('18px');
    expect(extend.spacing.gutter).toBe('24px');
  });
});
