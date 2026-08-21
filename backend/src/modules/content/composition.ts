/**
 * ① 콘텐츠 조회 조립 루트 (R1)
 *
 * R2 composition.ts와 같은 규칙 — 라우트가 배선을 직접 하지 않고 이 함수를 통해 서비스를 얻는다.
 *
 * ⚠️ 이 파일은 3인 공유 파일이다(Task 1·2·4·5). `catalogService`(Task 2, R4)·
 *    `pageService`(Task 5, R4)는 아직 없다 — 각 태스크가 자기 서비스를 만들 때 이 파일에
 *    필드를 추가한다. `readingState`를 지금부터 받는 이유는 catalogService가 R2의
 *    cutoffService를 주입받아야 하기 때문이다(진도 결합) — 나중에 시그니처를 바꾸면
 *    Round 1에서 이미 배선한 routes.ts 호출부도 다시 고쳐야 한다.
 */

import type { Pool } from 'pg'
import type { ReadingStateServices } from '../reading-state/composition'
import { createBookInfoService } from './book-info.service'
import { createPgContentRepository, type QueryClient } from './pg-repository'
import type { ContentRepository } from './repository'

export interface ContentServices {
  content: ContentRepository
  bookInfoService: ReturnType<typeof createBookInfoService>
}

function toQueryClient(pool: Pool): QueryClient {
  return { query: (sql: string, params?: unknown[]) => pool.query(sql, params) }
}

export function createContentServices(pool: Pool, readingState: ReadingStateServices): ContentServices {
  void readingState // Task 2(catalogService)가 실제로 쓴다 — 지금은 배선 지점만 고정한다

  const db = toQueryClient(pool)
  const content = createPgContentRepository(db)

  return {
    content,
    bookInfoService: createBookInfoService({ content }),
  }
}
