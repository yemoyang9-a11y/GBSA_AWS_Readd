import { resolveBriefingView } from './briefingView';
import type { BriefingResponse } from '../types';

function briefing(overrides: Partial<BriefingResponse>): BriefingResponse {
  return {
    applied_cutoff: 79,
    recap: '정주사는 고무신 장사로 돈을 모았고...',
    current_chapter: { chapter_no: 3, title: '제3장' },
    progress: { current_page: 80, total_pages: 411, percent: 19.5 },
    ...overrides,
  };
}

/**
 * 브리핑 화면 분기 (FR-BRF-002~005, D13 ①)
 *
 * 자가 검증 20·21번을 같은 분기로 처리하면 첫 진입에서 LLM 이 호출된다 —
 * 이 프로젝트에서 가장 틀리기 쉬운 지점이라 분기 판정만 따로 떼어 테스트한다.
 */
describe('브리핑 화면 분기', () => {
  it('저장 리캡이 있으면 그대로 표시한다', () => {
    expect(resolveBriefingView(briefing({}))).toEqual({ kind: 'recap' });
  });

  it('자가 검증 21: 저장분이 없으면(recap: null) 스트리밍 폴백을 호출한다', () => {
    expect(resolveBriefingView(briefing({ recap: null }))).toEqual({ kind: 'fallback' });
  });

  it('자가 검증 20 / D13 ①: 첫 진입(cutoff = 0)은 빈 상태이며 폴백을 호출하지 않는다', () => {
    expect(resolveBriefingView(briefing({ applied_cutoff: 0, recap: null }))).toEqual({
      kind: 'empty',
    });
  });

  it('cutoff = 0 이면 리캡 텍스트가 딸려 와도 빈 상태다 — 읽은 내용이 없는데 리캡이 있을 수 없다', () => {
    expect(resolveBriefingView(briefing({ applied_cutoff: 0 }))).toEqual({ kind: 'empty' });
  });
});
