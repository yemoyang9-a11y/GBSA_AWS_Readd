/**
 * GET /books/{b}/info — i 팝업 (R1, S1)
 *
 * 조항: FR-BRW-003 AC②(4개 정보 항목) · AC③(3영역 분리) · FR-NAV-001(목차 전체 상시) · R5
 *
 * ⚠️ 이 엔드포인트는 cutoff를 받지 않는다. 배경지식·소개는 상한 대상이 아니고(R5),
 *    목차도 전체 상시 노출이다(FR-NAV-001). 상한 예외이므로 (page, seq)도 동봉하지 않는다
 *    (team-sync-r4.md §4.3).
 */

import type { ChapterRow, ContentRepository } from './repository'

export interface BookInfoResponse {
  basic_info: {
    title: string
    author: string
    published_year: number | null
    /** FR-BRW-003 AC② '분량' — books.extent (소개용 문구). total_pages와 별개 */
    length_note: string | null
    /** 읽기 화면의 "12 / 411" 표시용 (team-sync §4.5) */
    total_pages: number
  }
  /** 책 소개 — 상한 예외 (R5) */
  introduction: string
  /** 배경지식 — 상한 예외 (R5, FR-BGK-002 🚦) */
  background: string
  /** 목차 — 장 경계 4필드만. 장 요약을 절대 넣지 않는다 (team-sync §4.1 R2 조건) */
  chapters: ChapterRow[]
}

export interface BookInfoServiceDeps {
  content: ContentRepository
}

export interface BookInfoService {
  getInfo(bookId: string): Promise<BookInfoResponse | null>
}

export function createBookInfoService(deps: BookInfoServiceDeps): BookInfoService {
  const { content } = deps

  return {
    async getInfo(bookId: string): Promise<BookInfoResponse | null> {
      const basic = await content.findBasicInfo(bookId)
      if (basic === null) return null

      const [texts, chapters] = await Promise.all([
        content.findBackgroundAndIntro(bookId),
        content.findChapters(bookId),
      ])

      return {
        basic_info: {
          title: basic.title,
          author: basic.author,
          published_year: basic.publish_year,
          length_note: basic.extent,
          total_pages: basic.total_pages,
        },
        introduction: texts.introduction,
        background: texts.background,
        chapters,
      }
    },
  }
}
