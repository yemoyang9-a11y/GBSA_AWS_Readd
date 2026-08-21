/**
 * GET /books/{b}/info — FR-BRW-003 AC②·AC③, FR-NAV-001, R5
 *
 * 3영역을 분리해 내려보내고(혼합 금지), 목차는 전체를 담되 장 요약은 절대 섞지 않는다.
 */

import { createBookInfoService } from '../../../src/modules/content/book-info.service';
import type { ContentRepository } from '../../../src/modules/content/repository';

function repo(overrides: Partial<ContentRepository> = {}): ContentRepository {
  return {
    findCatalog: async () => [],
    findReadiness: async () => true,
    findBasicInfo: async () => ({
      title: '탁류',
      author: '채만식',
      publish_year: 1937,
      extent: '411페이지',
      total_pages: 411,
    }),
    findChapters: async () => [
      { chapter_no: 1, title: '제1장 인간기념물', start_page: 1, end_page: 20 },
      { chapter_no: 2, title: '제2장 생활 제일과', start_page: 21, end_page: 45 },
    ],
    findBackgroundAndIntro: async () => ({
      introduction: '1930년대 군산을 배경으로...',
      background: '일제강점기 후반, 자본주의가...',
    }),
    findPage: async () => null,
    ...overrides,
  };
}

describe('BookInfoService', () => {
  test('FR-BRW-003 AC③: 기본정보·소개·배경지식을 분리 필드로 내려보낸다 (혼합 금지)', async () => {
    const info = (await createBookInfoService({ content: repo() }).getInfo('takryu'))!;

    expect(info.basic_info).toEqual({
      title: '탁류',
      author: '채만식',
      published_year: 1937,
      length_note: '411페이지',
      total_pages: 411,
    });
    expect(info.introduction).toBe('1930년대 군산을 배경으로...');
    expect(info.background).toBe('일제강점기 후반, 자본주의가...');
    // 한 필드에 두 구분이 뭉쳐 있지 않다 (검수 기준 info_separation_ok)
    expect(info.introduction).not.toContain('일제강점기');
  });

  test('FR-NAV-001: 목차는 전체 장을 담고, 장 요약 필드를 절대 포함하지 않는다', async () => {
    const info = (await createBookInfoService({ content: repo() }).getInfo('takryu'))!;

    expect(info.chapters).toHaveLength(2);
    expect(info.chapters[0]).toEqual({
      chapter_no: 1,
      title: '제1장 인간기념물',
      start_page: 1,
      end_page: 20,
    });
    // 장 요약은 상한 대상(FR-SPL-003 🚦) — 한 응답에 섞이면 전량이 프론트에 내려가 상한이 뚫린다
    for (const chapter of info.chapters) {
      expect(Object.keys(chapter).sort()).toEqual([
        'chapter_no',
        'end_page',
        'start_page',
        'title',
      ]);
    }
  });

  test('R5: 배경지식·소개는 K와 무관하다 — 어떤 기준점 인자도 받지 않는다', () => {
    // 시그니처 자체로 고정한다. cutoff 인자가 생기면 이 테스트가 깨진다
    expect(createBookInfoService({ content: repo() }).getInfo.length).toBe(1);
  });

  test('없는 도서는 null (404의 재료)', async () => {
    const service = createBookInfoService({ content: repo({ findBasicInfo: async () => null }) });
    expect(await service.getInfo('nope')).toBeNull();
  });

  test('배경지식·소개 행이 아직 없으면 빈 문자열로 내려간다 — 부분 응답이 아니라 빈 영역', async () => {
    const service = createBookInfoService({
      content: repo({ findBackgroundAndIntro: async () => ({ introduction: '', background: '' }) }),
    });
    const info = (await service.getInfo('takryu'))!;
    expect(info.introduction).toBe('');
    expect(info.background).toBe('');
    expect(info.basic_info.title).toBe('탁류');
  });
});
