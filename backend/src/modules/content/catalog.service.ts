/**
 * GET /books — 카탈로그 (R4, S1)
 *
 * 조항: FR-BRW-001(목록) · FR-BRW-002 🚦(완비 여부) · FR-BRF-005 🚦(파생값 단일 원천)
 *
 * ⚠️ percent 를 여기서 계산하지 않는다. R2 cutoffService 가 만든 값을 그대로 옮긴다.
 *    대시보드 % · 브리핑 % · 싸비 기준점의 "불일치 0건"은 검증이 아니라
 *    계산 지점 단일화로 달성한다 (00-shared §2.1).
 */

import type { CutoffService } from '../reading-state/cutoff.service'
import type { ReadingPositionRepository } from '../reading-state/repository'
import type { ContentRepository } from './repository'

export interface CatalogItem {
  book_id: string
  title: string
  author: string
  cover_url: string | null
  /** 대시보드 카드 소개 문구. 상한 예외 (R5) — D-3 */
  intro_summary: string | null
  ssabi_ready: boolean
  /** 읽던 도서만. 저장 위치가 없으면 필드 자체가 없다 */
  progress?: { current_page: number; percent: number }
}

export interface CatalogResponse {
  books: CatalogItem[]
}

export interface CatalogServiceDeps {
  content: ContentRepository
  positions: ReadingPositionRepository
  cutoffService: CutoffService
}

export interface CatalogService {
  getCatalog(deviceId: string): Promise<CatalogResponse>
}

export function createCatalogService(deps: CatalogServiceDeps): CatalogService {
  const { content, positions, cutoffService } = deps

  return {
    async getCatalog(deviceId: string): Promise<CatalogResponse> {
      const catalog = await content.findCatalog()

      const books = await Promise.all(
        catalog.map(async (row): Promise<CatalogItem> => {
          const item: CatalogItem = {
            book_id: row.book_id,
            title: row.title,
            author: row.author,
            cover_url: row.cover_url,
            intro_summary: row.intro_summary,
            ssabi_ready: row.ssabi_ready,
            // total_pages 를 싣지 않는다 — 프론트에 current_page / total_pages 재계산
            // 재료를 주지 않기 위해서다 (절대 규칙 2번, D-1, team-sync §4.5)
          }

          // 저장 위치가 없으면 "읽던 도서"가 아니다. getCutoffSnapshot 은 위치가 없어도
          // current_page=1 로 스냅샷을 만들어 주므로, 그것만 보고 판단하면 읽지 않은 책에
          // 0.2% 진도가 생긴다 — 먼저 저장 위치의 존재를 확인한다
          const stored = await positions.findPosition(deviceId, row.book_id)
          if (stored === null) return item

          try {
            const snapshot = await cutoffService.getCutoffSnapshot(deviceId, row.book_id)
            item.progress = {
              current_page: snapshot.current_page,
              percent: snapshot.percent, // R2 계산값 — 그대로 옮긴다 (FR-BRF-005 🚦)
            }
          } catch {
            // 스냅샷 실패(장 커버리지 결함 등)는 진도 미표시로 끝낸다. 기본값으로 메우지 않는다
            // (실패 = 미노출, FR-SPL-005 🚦 / R11). 도서 카드 자체는 뜬다
          }

          return item
        })
      )

      return { books }
    },
  }
}
