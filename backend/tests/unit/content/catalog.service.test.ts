/**
 * GET /books — FR-BRW-001·002
 *
 * 핵심 두 가지:
 *   ① 읽던 도서만 progress 를 담는다 (저장 위치가 없으면 필드 자체가 없다)
 *   ② percent 는 R2 스냅샷 값을 그대로 옮긴다 — R4 가 계산하지 않는다 (FR-BRF-005 🚦)
 */

import { createCatalogService } from '../../../src/modules/content/catalog.service';
import type { BookCatalogRow, ContentRepository } from '../../../src/modules/content/repository';
import type { CutoffService } from '../../../src/modules/reading-state/cutoff.service';
import type {
  ReadingPositionRepository,
  StoredPosition,
} from '../../../src/modules/reading-state/repository';
import type { CutoffSnapshot } from '../../../src/shared/types';

const CATALOG: BookCatalogRow[] = [
  {
    book_id: 'takryu',
    title: '탁류',
    author: '채만식',
    cover_url: 'https://x/1.png',
    intro_summary: '1930년대 군산',
    ssabi_ready: true,
  },
  {
    book_id: 'other',
    title: '다른 책',
    author: '아무개',
    cover_url: null,
    intro_summary: null,
    ssabi_ready: false,
  },
];

const SNAPSHOT: CutoffSnapshot = {
  current_page: 80,
  cutoff: 79,
  percent: 23.5,
  is_complete: false,
  chapter: { chapter_no: 3, title: '제3장' },
};

function repoWith(catalog: BookCatalogRow[]): ContentRepository {
  return {
    findCatalog: async () => catalog,
    findReadiness: async () => true,
    findBasicInfo: async () => null,
    findChapters: async () => [],
    findBackgroundAndIntro: async () => ({ introduction: '', background: '' }),
    findPage: async () => null,
  };
}

function positionsWith(
  find: (deviceId: string, bookId: string) => Promise<StoredPosition | null>
): ReadingPositionRepository {
  return {
    findPosition: find,
    savePosition: async () => {},
    resetEventSeq: async () => {},
  };
}

function cutoffWith(
  get: (deviceId: string, bookId: string) => Promise<CutoffSnapshot>
): CutoffService {
  return { getCutoffSnapshot: get };
}

describe('CatalogService', () => {
  test('읽던 도서만 progress 를 포함한다 (FR-BRW-001)', async () => {
    const service = createCatalogService({
      content: repoWith(CATALOG),
      positions: positionsWith(async (_d, bookId) =>
        bookId === 'takryu' ? { current_page: 80, event_seq: 3 } : null
      ),
      cutoffService: cutoffWith(async () => SNAPSHOT),
    });

    const { books } = await service.getCatalog('device-1');

    // 정렬은 리포지토리(ORDER BY title)가 한다 — 서비스는 순서를 바꾸지 않는다
    expect(books.map((b) => b.book_id)).toEqual(['takryu', 'other']);
    expect(books[0].progress).toEqual({ current_page: 80, percent: 23.5 });
    expect(books[1].progress).toBeUndefined();
  });

  test('percent 는 R2 스냅샷 값을 그대로 옮긴다 — 재계산 0건 (FR-BRF-005 🚦)', async () => {
    const service = createCatalogService({
      content: repoWith([CATALOG[0]]),
      positions: positionsWith(async () => ({ current_page: 80, event_seq: 3 })),
      cutoffService: cutoffWith(async () => ({ ...SNAPSHOT, percent: 0.2 })),
    });

    const { books } = await service.getCatalog('device-1');

    // 0.2 를 0 으로 반올림하거나 재계산하지 않는다. 반올림은 프론트 표시 단계의 몫이다 (team-sync §4.9)
    expect(books[0].progress?.percent).toBe(0.2);
  });

  test('미완비 도서도 목록에 담고 ssabi_ready 를 그대로 내려보낸다 (FR-BRW-002 🚦)', async () => {
    const service = createCatalogService({
      content: repoWith(CATALOG),
      positions: positionsWith(async () => null),
      cutoffService: cutoffWith(async () => SNAPSHOT),
    });

    const { books } = await service.getCatalog('device-1');

    // 목록에서 빼면 대시보드가 "표지는 띄우되 잠근다"를 할 수 없다 (S2)
    expect(books).toHaveLength(2);
    expect(books[1].ssabi_ready).toBe(false);
  });

  test('응답에 total_pages 가 없다 — 대시보드에 나눗셈 재료를 주지 않는다 (절대 규칙 2번, D-1)', async () => {
    const service = createCatalogService({
      content: repoWith([CATALOG[0]]),
      positions: positionsWith(async () => ({ current_page: 80, event_seq: 3 })),
      cutoffService: cutoffWith(async () => SNAPSHOT),
    });

    const { books } = await service.getCatalog('device-1');

    expect(books[0]).not.toHaveProperty('total_pages');
  });

  test('저장 위치가 없으면 스냅샷을 묻지도 않는다 — 안 읽은 책에 0.2% 가 생기지 않는다', async () => {
    let asked = 0;
    const service = createCatalogService({
      content: repoWith([CATALOG[0]]),
      positions: positionsWith(async () => null),
      cutoffService: cutoffWith(async () => {
        asked += 1;
        return SNAPSHOT;
      }),
    });

    const { books } = await service.getCatalog('device-1');

    // getCutoffSnapshot 은 위치가 없어도 current_page=1 스냅샷을 만들어 준다.
    // 그것만 보고 판단하면 읽지 않은 책에 진도가 붙는다
    expect(books[0].progress).toBeUndefined();
    expect(asked).toBe(0);
  });

  test('진도 조회가 실패해도 목록 전체를 죽이지 않는다 — 그 도서만 progress 없이 내려간다', async () => {
    const service = createCatalogService({
      content: repoWith([CATALOG[0]]),
      positions: positionsWith(async () => ({ current_page: 80, event_seq: 3 })),
      cutoffService: cutoffWith(async () => {
        throw new Error('장 커버리지 구멍');
      }),
    });

    const { books } = await service.getCatalog('device-1');

    // 실패 = 미노출 (R11, FR-SPL-005 🚦) — 없는 진도를 지어내지 않고, 대시보드 자체는 뜬다
    expect(books).toHaveLength(1);
    expect(books[0].progress).toBeUndefined();
  });
});
