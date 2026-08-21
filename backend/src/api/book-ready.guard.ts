/**
 * 미완비 도서 조회 거절 — FR-BRW-002 🚦, R12
 *
 * 차단 지점이 셋으로 갈린다 (team-sync-r4.md §4.7):
 *   플래그 설정 → R1 (검수 후 ssabi_ready)
 *   진입 거절   → R2 (POST /books/{b}/entry)
 *   조회 거절   → R4 (이 파일) — /info · /pages · /ssabi/*
 *
 * 대시보드의 클릭 불가는 UI 조치일 뿐이다. 자가 검증 25번이 "API를 직접 호출해도
 * 서버가 거절"을 요구하므로 둘 다 있어야 한다.
 *
 * 미완비(403)와 부재(404)를 구분한다. 존재 여부를 403 으로 뭉뚱그리면 클라이언트가
 * "없는 책"과 "아직 준비 안 된 책"을 구별하지 못한다. 둘 다 상한과 무관한 판정이라
 * 구분해도 새는 정보가 없다 — 도서 목록 자체가 미완비 도서를 포함해 내려간다 (S2).
 */

import type { Response } from 'express'
import type { ContentRepository } from '../modules/content/repository'

/**
 * @returns 진행해도 되면 true. false 면 이 함수가 이미 응답을 보냈으므로 핸들러는 즉시 return 한다.
 */
export async function ensureBookReady(
  content: ContentRepository,
  bookId: string,
  res: Response
): Promise<boolean> {
  const ready = await content.findReadiness(bookId)

  if (ready === null) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Book not found' })
    return false
  }

  if (!ready) {
    // 대문자 상수 — API_CONTRACT.md 에러 표 형식 (team-sync §4.2)
    res.status(403).json({ error: 'BOOK_NOT_READY', message: 'Book is not ready' })
    return false
  }

  return true
}
