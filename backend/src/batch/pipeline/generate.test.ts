import {
  buildPageTaggedText,
  buildSummaryPrompt,
  buildCharacterPrompt,
  buildRelationshipPrompt,
  buildBackgroundPrompt,
  buildTermPrompt,
  buildEventPrompt,
  parseJsonResponse,
} from './generate';
import { Chapter, Page } from '../../shared/types';

const chapter: Chapter = {
  id: 'c1',
  book_id: 'takryu',
  chapter_no: 1,
  title: '인간기념물',
  start_page: 1,
  end_page: 2,
};
const pages: Page[] = [
  { id: 'p1', book_id: 'takryu', page_no: 1, content: '첫 페이지 내용.' },
  { id: 'p2', book_id: 'takryu', page_no: 2, content: '둘째 페이지 내용.' },
];

describe('buildPageTaggedText', () => {
  test('각 페이지에 [페이지 N] 표시를 단다', () => {
    const text = buildPageTaggedText(pages);
    expect(text).toContain('[페이지 1]\n첫 페이지 내용.');
    expect(text).toContain('[페이지 2]\n둘째 페이지 내용.');
  });
});

describe('프롬프트 빌더 — 장 번호·제목·원문이 포함되는지', () => {
  test('장 요약 프롬프트에 장 번호·제목·원문이 들어간다', () => {
    const p = buildSummaryPrompt(chapter, pages);
    expect(p).toContain('1장');
    expect(p).toContain('인간기념물');
    expect(p).toContain('첫 페이지 내용.');
  });

  test('인물 프롬프트에 기존 인물 목록이 반영된다', () => {
    const withKnown = buildCharacterPrompt(chapter, pages, ['정주사']);
    expect(withKnown).toContain('정주사');

    const withoutKnown = buildCharacterPrompt(chapter, pages, []);
    expect(withoutKnown).toContain('없음');
  });

  test('관계 프롬프트에 이력형 규칙(라벨 덮어쓰기 금지)이 명시된다', () => {
    const p = buildRelationshipPrompt(chapter, pages, ['정주사', '초봉이']);
    expect(p).toContain('덮어쓰지');
  });

  test('배경지식 프롬프트가 결말 언급 금지를 명시한다', () => {
    const p = buildBackgroundPrompt('탁류', '채만식');
    expect(p).toContain('결말');
    expect(p).toContain('금지');
  });

  test('용어·사건 프롬프트에 원문이 들어간다', () => {
    expect(buildTermPrompt(chapter, pages)).toContain('첫 페이지 내용.');
    expect(buildEventPrompt(chapter, pages)).toContain('첫 페이지 내용.');
  });
});

describe('parseJsonResponse', () => {
  test('순수 JSON을 파싱한다', () => {
    expect(parseJsonResponse<{ summary: string }>('{"summary": "요약"}')).toEqual({
      summary: '요약',
    });
  });

  test('마크다운 코드블록으로 감싼 JSON도 파싱한다', () => {
    const raw = '```json\n{"summary": "요약"}\n```';
    expect(parseJsonResponse<{ summary: string }>(raw)).toEqual({ summary: '요약' });
  });

  test('앞뒤에 설명 텍스트가 붙어도 JSON만 뽑아낸다', () => {
    const raw = '알겠습니다.\n{"summary": "요약"}\n감사합니다.';
    expect(parseJsonResponse<{ summary: string }>(raw)).toEqual({ summary: '요약' });
  });

  test('JSON이 없으면 에러를 던진다', () => {
    expect(() => parseJsonResponse('그냥 텍스트')).toThrow();
  });
});
