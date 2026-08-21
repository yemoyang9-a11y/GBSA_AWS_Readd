/**
 * 인물 노트 표시 상한 — A5 (자가 검증 13·14)
 *
 * 기준점 이하 중 최대 8문장. 초과 시 **최초 1문장 + 최근 7문장**.
 * 절단은 서버가 한다 — 프론트가 자르지 않는다.
 */

import { truncateNotes } from '../../../src/modules/ssabi/notes'
import type { CharacterNote } from '../../../src/shared/types'

function notes(count: number): CharacterNote[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i + 1}`,
    character_id: 'jeong',
    note: `문장${i + 1}`,
    source_page: i + 1,
  }))
}

describe('truncateNotes — A5', () => {
  test('자가 검증 14: 8문장 이하면 전부 표시한다', () => {
    expect(truncateNotes(notes(8))).toBe('문장1 문장2 문장3 문장4 문장5 문장6 문장7 문장8')
    expect(truncateNotes(notes(3))).toBe('문장1 문장2 문장3')
  })

  test('자가 검증 13: 8문장 초과면 최초 1문장 + 최근 7문장', () => {
    // 12문장 → 문장1 + 문장6~12
    expect(truncateNotes(notes(12))).toBe('문장1 문장6 문장7 문장8 문장9 문장10 문장11 문장12')
  })

  test('경계: 9문장이면 최초 1 + 최근 7 = 8문장이고 문장2가 빠진다', () => {
    const result = truncateNotes(notes(9))

    expect(result.split(' ')).toHaveLength(8)
    expect(result.startsWith('문장1 ')).toBe(true)
    expect(result.split(' ')).not.toContain('문장2')
    expect(result.split(' ')).toContain('문장9')
  })

  test('절단해도 항상 8문장을 넘지 않는다 — 상한이 문장 수다', () => {
    for (const n of [9, 10, 20, 100]) {
      expect(truncateNotes(notes(n)).split(' ')).toHaveLength(8)
    }
  })

  test('노트가 없으면 빈 문자열 — 없는 설명을 지어내지 않는다', () => {
    expect(truncateNotes([])).toBe('')
  })

  test('최초 문장은 언제나 남는다 — 인물 도입부 맥락을 잃지 않는다', () => {
    expect(truncateNotes(notes(50)).split(' ')[0]).toBe('문장1')
  })
})
