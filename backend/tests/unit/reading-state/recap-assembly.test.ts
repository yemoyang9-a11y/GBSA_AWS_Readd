/**
 * S5 게이트 테스트 — 리캡 입력 조립 (경계값이 핵심)
 *
 * 근거: dev-spec-R2-core.md 4.5절 자가 검증 표 9~12번
 *
 * 테스트 규약 3.2절에 따라 구현 전에 작성했다. 조항 문구를 테스트 이름에 그대로 넣는다.
 */

import { assembleRecapInput } from '../../../src/modules/reading-state/recap-assembly'
import { SEED_BOOK_ID, makeSeededFakes } from './fakes'

describe('리캡 입력 조립 — assembleRecapInput', () => {
  test('❓Q1: K = 0 → 완전히 빈 상태 (완결 장 요약 0건, 현재 장 원문 없음)', async () => {
    const { books } = makeSeededFakes()

    const input = await assembleRecapInput({ content: books, books }, SEED_BOOK_ID, 0)

    expect(input.chapter_summaries).toEqual([])
    expect(input.current_chapter_text).toBeNull()
    expect(input.cutoff).toBe(0)
  })

  test('5.2절 흐름 B: K가 장 종료 페이지와 정확히 일치(K=10) → 그 장 요약만 투입, 원문 미투입', async () => {
    const { books } = makeSeededFakes()

    const input = await assembleRecapInput({ content: books, books }, SEED_BOOK_ID, 10)

    expect(input.chapter_summaries.map((s) => s.chapter_no)).toEqual([1])
    expect(input.current_chapter_text).toBeNull() // 중복 투입 방지 — 9번이 가장 자주 틀리는 지점
  })

  test('FR-SPL-003 🚦: K가 장 중간(K=15) → [현재 장 시작(11)..K(15)] 원문 투입', async () => {
    const { books } = makeSeededFakes()

    const input = await assembleRecapInput({ content: books, books }, SEED_BOOK_ID, 15)

    expect(input.current_chapter_text).toBe('p.11 원문\np.12 원문\np.13 원문\np.14 원문\np.15 원문')
    // 15는 2장(11~20) 중간이므로 완결 장은 1장뿐 — 2장 요약이 섞여 들어오면 안 된다
    expect(input.chapter_summaries.map((s) => s.chapter_no)).toEqual([1])
  })

  test('FR-SPL-003 🚦: 투입된 장 요약이 전부 종료 페이지 <= K (K=25 — 2장까지 완결)', async () => {
    const { books } = makeSeededFakes()

    const input = await assembleRecapInput({ content: books, books }, SEED_BOOK_ID, 25)

    expect(input.chapter_summaries.map((s) => s.chapter_no)).toEqual([1, 2])
    for (const summary of input.chapter_summaries) {
      expect(summary.end_page).toBeLessThanOrEqual(25)
    }
    expect(input.current_chapter_text).toBe('p.21 원문\np.22 원문\np.23 원문\np.24 원문\np.25 원문')
  })

  test('마지막 페이지 종료 경계(K=30) — 3장까지 전부 완결, 원문 미투입', async () => {
    const { books } = makeSeededFakes()

    const input = await assembleRecapInput({ content: books, books }, SEED_BOOK_ID, 30)

    expect(input.chapter_summaries.map((s) => s.chapter_no)).toEqual([1, 2, 3])
    expect(input.current_chapter_text).toBeNull()
  })

  test('FR-SPL-005 🚦: K가 속한 장을 찾을 수 없으면(장 경계 결함) 빈 값으로 메우지 않고 던진다', async () => {
    const { books } = makeSeededFakes()
    books.set('gap-book', { total_pages: 30, chapters: [] })

    await expect(assembleRecapInput({ content: books, books }, 'gap-book', 5)).rejects.toThrow(/장/)
  })
})
