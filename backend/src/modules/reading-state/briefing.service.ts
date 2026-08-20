/**
 * 브리핑 조립 — 저장 리캡(기준점 일치 검증) + 목차 위치 + 진도 파생값 (R2, S6)
 *
 * @see dev-spec-R2-core.md S6
 * @see architecture-r1.md 4.1절 "첫 진입 브리핑" · 4.2절 briefing 엔드포인트
 *
 * 조항: R8 (재사용은 기준점 완전 일치) · FR-BRF-005 🚦 (파생값 단일 원천) · ❓Q1
 *
 * ⚠️ 첫 진입(cutoff = 0)과 "저장분 부재"를 같은 분기로 처리하지 않는다. 저장분 부재는
 *    "만들 수 있는데 없는 것"(폴백 대상)이고, 첫 진입은 "만들 내용 자체가 없는 것"
 *    (폴백 대상 아님)이다. 합치면 첫 진입에서 불필요한 스트리밍 폴백 호출이 발생한다.
 */

import type { CutoffService } from './cutoff.service'
import type { BookMetaReader, SavedRecapRepository } from './repository'
import type { BriefingResponse } from '../../shared/types'

export interface BriefingServiceDeps {
  cutoffService: CutoffService
  books: BookMetaReader
  savedRecap: SavedRecapRepository
}

export interface BriefingService {
  getBriefing(deviceId: string, bookId: string): Promise<BriefingResponse>
}

export function createBriefingService(deps: BriefingServiceDeps): BriefingService {
  const { cutoffService, books, savedRecap } = deps

  return {
    async getBriefing(deviceId: string, bookId: string): Promise<BriefingResponse> {
      const snapshot = await cutoffService.getCutoffSnapshot(deviceId, bookId) // 요청당 1회 (2.1절)
      const totalPages = await books.findTotalPages(bookId)
      if (totalPages === null) {
        // cutoffService가 같은 조회로 이미 통과했으므로 이 분기는 사실상 도달하지 않는다.
        // 도달한다면 조회 사이 데이터가 사라진 결함이므로 메우지 않는다 (FR-SPL-005 🚦).
        throw new Error(`[briefing] total_pages를 확인할 수 없다: bookId=${bookId}`)
      }

      let recap: string | null = null
      if (snapshot.cutoff > 0) {
        // ❓Q1 — K=0은 재사용 판정 자체를 하지 않는다. "만들 내용이 없음"과
        // "저장분이 없어서 못 보여줌"을 같은 null로 뭉개면 첫 진입에서 불필요한
        // 스트리밍 폴백이 발생한다(4.1절).
        const saved = await savedRecap.findSavedRecap(deviceId, bookId)
        if (saved !== null && saved.cutoff_page === snapshot.cutoff) {
          recap = saved.recap_text // R8 — 완전 일치만 재사용
        }
        // saved === null 이거나 기준점이 다르면 recap은 null로 남고, applied_cutoff > 0
        // 이므로 클라이언트가 스트리밍 폴백을 호출한다(recap/stream).
      }

      return {
        applied_cutoff: snapshot.cutoff, // 클라이언트가 폴백 필요/불필요를 가르는 근거(❓Q1)
        recap,
        current_chapter: snapshot.chapter, // FR-BRF-005 🚦 — 결정기 스냅샷과 동일 원천
        progress: {
          current_page: snapshot.current_page,
          total_pages: totalPages,
          percent: snapshot.percent,
        },
      }
    },
  }
}
