/**
 * ① 콘텐츠 조회 조립 루트 (R1)
 *
 * R2 composition.ts와 같은 규칙 — 라우트가 배선을 직접 하지 않고 이 함수를 통해 서비스를 얻는다.
 *
 * ⚠️ 이 파일은 3인 공유 파일이다(Task 1·2·4·5). `readingState`를 받는 이유는
 *    catalogService가 R2의 cutoffService를 주입받아야 하기 때문이다(진도 결합) —
 *    퍼센트 계산 지점을 늘리지 않으려고 R2 서비스를 그대로 쓴다 (00-shared §2.1).
 */

import type { Pool } from 'pg';
import type { ReadingStateServices } from '../reading-state/composition';
import { createPgReadingPositionRepository } from '../reading-state/pg-repository';
import { createBookInfoService } from './book-info.service';
import { createCatalogService } from './catalog.service';
import { createPageService } from './page.service';
import { createPgContentRepository, type QueryClient } from './pg-repository';
import type { ContentRepository } from './repository';

export interface ContentServices {
  content: ContentRepository;
  bookInfoService: ReturnType<typeof createBookInfoService>;
  catalogService: ReturnType<typeof createCatalogService>;
  pageService: ReturnType<typeof createPageService>;
}

function toQueryClient(pool: Pool): QueryClient {
  return { query: (sql: string, params?: unknown[]) => pool.query(sql, params) };
}

export function createContentServices(
  pool: Pool,
  readingState: ReadingStateServices
): ContentServices {
  const db = toQueryClient(pool);
  const content = createPgContentRepository(db);
  const positions = createPgReadingPositionRepository(db);

  return {
    content,
    bookInfoService: createBookInfoService({ content }),
    catalogService: createCatalogService({
      content,
      positions,
      cutoffService: readingState.cutoffService,
    }),
    pageService: createPageService({ content }),
  };
}
