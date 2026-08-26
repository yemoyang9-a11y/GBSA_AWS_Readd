/**
 * 장 요약 렌더링 — 장 번호·페이지 범위가 프롬프트에 실제로 들어가는지
 *
 * ⚠️ 실사용 중 발견(2026-08-26, 사용자 제보) — 현재 페이지가 60인데 "1장까지 요약해줘"가
 * 근거 부재 문구로 거절됐다. 1장은 p.17에 끝나므로 근거(K=60)에 확실히 들어 있었는데도
 * 거절된 이유는, buildPrompt가 장 요약을 `### {title} (종료: p.{end_page})`로만 렌더링해
 * **장 번호를 프롬프트에 넣지 않았기** 때문이다. 모델 눈에는 "인간기념물"이라는 제목만
 * 보이지 그게 1장인지 알 방법이 없었다. 같은 질문을 제목으로("인간기념물 장 요약해줘")
 * 물으면 곧바로 답하는 것으로 원인을 확정했다.
 *
 * 이건 같은 유형의 세 번째 버그다 — 인물 노트 미렌더링, 관계의 인물 이름 미렌더링에 이어
 * "DB에서 조회하고 로그엔 근거로 썼다고 기록하는데 buildPrompt가 그 필드를 안 넣는" 패턴이
 * 반복됐다. 그래서 이번엔 개별 필드가 아니라 **ChapterSummary의 모든 식별 필드가
 * 프롬프트에 실린다**는 것을 기계적으로 고정한다.
 */

import { buildPrompt } from '../context-assembly';
import type { ChatbotContext } from '../../../shared/types';

function makeContext(overrides: Partial<ChatbotContext> = {}): ChatbotContext {
  return {
    book: { title: '탁류', author: '채만식' },
    chapter_summaries: [
      {
        chapter_no: 1,
        title: '인간기념물',
        content: '정주사가 미두장에서 봉욕을 당한다.',
        start_page: 1,
        end_page: 17,
      },
      {
        chapter_no: 2,
        title: '생활 제일과',
        content: '초봉이가 제중당에서 일한다.',
        start_page: 18,
        end_page: 39,
      },
    ],
    current_chapter_text: null,
    entities: {
      characters: [],
      relationships: [],
      character_notes: [],
      terms: [],
      events: [],
    },
    background: '',
    ...overrides,
  };
}

describe('장 요약 렌더링 (2026-08-26 회귀)', () => {
  test('장 번호가 프롬프트에 들어간다 — "1장"으로 물어도 모델이 찾을 수 있어야 한다', () => {
    const prompt = buildPrompt(makeContext(), '(규칙)');

    expect(prompt).toContain('1장');
    expect(prompt).toContain('2장');
  });

  test('장 제목도 그대로 들어간다 (기존 동작 유지)', () => {
    const prompt = buildPrompt(makeContext(), '(규칙)');

    expect(prompt).toContain('인간기념물');
    expect(prompt).toContain('생활 제일과');
  });

  test('시작·종료 페이지가 범위로 들어간다 — "15페이지까지 요약해줘"를 판단할 근거', () => {
    const prompt = buildPrompt(makeContext(), '(규칙)');

    // 1장 = p.1~17 이므로 "15페이지까지"가 1장 안에 든다는 걸 모델이 알 수 있어야 한다
    expect(prompt).toMatch(/p\.1\s*~\s*17/);
    expect(prompt).toMatch(/p\.18\s*~\s*39/);
  });

  test('ChapterSummary의 모든 필드가 프롬프트에 실린다 — 필드 추가 시 렌더링 누락을 막는다', () => {
    const ctx = makeContext();
    const prompt = buildPrompt(ctx, '(규칙)');
    const ch = ctx.chapter_summaries[0];

    // 같은 패턴의 버그가 세 번 반복돼서, 개별 필드가 아니라 전 필드를 기계적으로 확인한다
    Object.entries(ch).forEach(([key, value]) => {
      expect(prompt.includes(String(value))).toBe(true);
      // 위 assertion이 실패하면 어느 필드인지 알 수 있게 남긴다
      if (!prompt.includes(String(value))) throw new Error(`렌더링 누락 필드: ${key}`);
    });
  });

  test('장 요약이 없으면 섹션 자체가 없다', () => {
    const prompt = buildPrompt(makeContext({ chapter_summaries: [] }), '(규칙)');

    expect(prompt).not.toContain('## 장 요약');
  });
});
