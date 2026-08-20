/**
 * 리캡 입력 조립 — LLM 없이 완성되는 조립 단계 (R2, S5)
 *
 * @see dev-spec-R2-core.md S5
 * @see architecture-r1.md 5.2절 흐름 B
 *
 * 조항: FR-SPL-003 🚦 (리캡 입력 절단) · NFR-AI-004 🚦 (상한은 데이터 선택 단계에서만)
 *
 * ⚠️ 상한은 여기서 **입력 절단으로** 강제한다. 프롬프트는 종합 지시만 담당하고 이 파일이
 *    상한 강제의 유일한 지점이다 — "기준점 이후 내용을 쓰지 마"라는 지시로 막는 구조를
 *    만들지 않는다(CLAUDE.md 절대 규칙 3번).
 */

import type { RecapInput } from '../../shared/types'
import type { BookMetaReader, RecapContentReader } from './repository'

export interface RecapAssemblyDeps {
  content: RecapContentReader
  books: BookMetaReader
}

/**
 * K(cutoff)에 대한 리캡 입력을 조립한다.
 *
 * K = 0(첫 진입)이면 완전히 빈 입력을 반환한다 — 조립 자체를 생략하며, 이 함수를 호출한
 * 쪽이 LLM을 부르지 않아도 되도록 빈 상태를 그대로 돌려준다(❓Q1, 호출 0회는 recap.service
 * 몫이지만 그 판단이 성립하는 근거가 여기의 빈 반환이다).
 *
 * K가 어느 장의 **종료 페이지와 정확히 일치**하면 그 장 요약이 이미 완결된 장 목록에
 * 들어 있으므로 원문을 다시 넣지 않는다(중복 투입 방지). 그 외 K가 장 중간이면
 * `[현재 장 시작 .. K]` 원문을 투입한다.
 */
export async function assembleRecapInput(
  deps: RecapAssemblyDeps,
  bookId: string,
  cutoff: number
): Promise<RecapInput> {
  if (cutoff <= 0) {
    return { chapter_summaries: [], current_chapter_text: null, cutoff }
  }

  const chapterSummaries = await deps.content.findCompletedChapterSummaries(bookId, cutoff)

  const chapterAtK = await deps.books.findChapterContaining(bookId, cutoff)
  if (chapterAtK === null) {
    // 장 범위 합집합 완전 커버는 파이프라인이 검증한다(FR-DAT-001 🚦). 도달했다면 데이터
    // 결함이므로 빈 값으로 메우지 않는다 — 실패 = 미노출(FR-SPL-005 🚦, R11).
    throw new Error(
      `[recap-assembly] cutoff=${cutoff}가 속한 장을 찾을 수 없어 조립을 만들지 않는다: bookId=${bookId}`
    )
  }

  const currentChapterText =
    chapterAtK.end_page === cutoff
      ? null // K가 장 종료 페이지와 일치 — 요약만, 원문 중복 투입 방지
      : (await deps.content.findCurrentChapterPageTexts(bookId, cutoff, chapterAtK.start_page)).join(
          '\n'
        )

  return {
    chapter_summaries: chapterSummaries.map((s) => ({
      chapter_no: s.chapter_no,
      title: s.title,
      content: s.content,
      end_page: s.end_page,
    })),
    current_chapter_text: currentChapterText,
    cutoff,
  }
}
