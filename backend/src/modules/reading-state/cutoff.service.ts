/**
 * ⭐ 기준점 결정기 — 이 시스템의 유일한 파생값 계산 지점 (R2, S1)
 *
 * @see CLAUDE.md 3장 — 시스템의 축
 * @see architecture-r1.md 3.3절 — 결정 지점과 전파
 * @see dev-spec-00-shared.md 2.1절 — 동결 계약
 * @see dev-spec-R2-core.md S1
 *
 * 조항: FR-PRG-003 🚦 (기준점 규칙) · FR-BRF-005 🚦 (파생값 단일 원천)
 *
 * ┌ 저장값 (유일) ────────────────────────────────────────────────┐
 * │  reading_position.current_page   ← 마지막으로 열어본 페이지      │
 * └───────────────────────────────────────────────────────────────┘
 *      cutoff  = current_page - 1               (FR-PRG-003 🚦)
 *      percent = current_page / total_pages     (R2 불변식, MVP 1장)
 *      chapter = current_page가 속한 장           (장 경계 테이블)
 *
 * ⚠️ **이 파일 밖에서 `page - 1`이나 `%`를 계산하는 코드는 존재해서는 안 된다** (프론트 포함).
 *    FR-BRF-005의 "불일치 0건"은 검증이 아니라 계산 지점 단일화로 달성한다.
 *    tests/static/derived-value-single-source.test.ts 가 이것을 기계적으로 고정한다.
 *
 * ⚠️ 기준점을 움직일 수 있는 입력은 "페이지 이동" 하나뿐이다. 이 함수는 인자로
 *    (deviceId, bookId)만 받는다 — 클라이언트가 기준점·페이지를 실어 보내는 경로가 없다
 *    (절대 규칙 8번, 3.3절). 진도 이벤트의 수용은 S2의 몫이며, 그 결과가 저장값에
 *    반영된 다음 이 함수가 파생만 담당한다.
 */

import type { CutoffSnapshot } from '../../shared/types';
import type { BookMetaReader, ReadingPositionRepository } from './repository';

export interface CutoffServiceDeps {
  positions: ReadingPositionRepository;
  books: BookMetaReader;
}

export interface CutoffService {
  /**
   * 기준점 스냅샷을 1회 만든다.
   *
   * 각 요청은 시작 시 이 스냅샷을 **1회** 받아, 요청 내 모든 쿼리·조립·로그가 그 값을
   * 쓴다. 질의 도중 페이지가 바뀌어도 그 요청은 시작 시점 기준점을 유지한다
   * (dev-spec-00-shared.md 2.1절, UC-27 A5).
   *
   * @throws 도서가 없거나 장 커버리지에 구멍이 있으면 스냅샷을 만들지 않고 던진다.
   *         실패 = 미노출이 원칙이므로 기본값으로 메우지 않는다 (FR-SPL-005 🚦, R11).
   */
  getCutoffSnapshot(deviceId: string, bookId: string): Promise<CutoffSnapshot>;
}

/**
 * 진도 레코드가 없을 때(첫 진입) 쓰는 저장 위치.
 *
 * 페이지 번호는 1-based이고(API_CONTRACT.md 공통 규칙) 첫 진입의 '마저 읽기'는
 * 1페이지로 들어간다(architecture-r1.md 4.1절). 따라서 저장 위치 부재는 `current_page = 1`
 * 과 같은 상태이며, 같은 규칙이 그대로 `cutoff = 0`을 만든다 — **별도 분기를 만들지 않는다**
 * (3.3절 경계값).
 */
export const FIRST_ENTRY_PAGE = 1;

/** 진도 % 표시 자리수. API_CONTRACT.md 예시(80 / 340 → 23.5)와 같은 규칙 */
const PERCENT_DECIMALS = 1;

export function createCutoffService(deps: CutoffServiceDeps): CutoffService {
  const { positions, books } = deps;

  return {
    async getCutoffSnapshot(deviceId: string, bookId: string): Promise<CutoffSnapshot> {
      const stored = await positions.findPosition(deviceId, bookId);

      // 저장값 — 유일한 원천 (3.3절)
      const currentPage = stored?.current_page ?? FIRST_ENTRY_PAGE;

      const totalPages = await books.findTotalPages(bookId);
      if (totalPages === null || totalPages <= 0) {
        throw new Error(
          `[cutoff] 도서의 total_pages를 확인할 수 없어 스냅샷을 만들지 않는다: bookId=${bookId}`
        );
      }

      const chapter = await books.findChapterContaining(bookId, currentPage);
      if (chapter === null) {
        // 장 범위 합집합 = [1, 마지막 페이지] 완전 커버는 파이프라인이 검증한다
        // (FR-DAT-001 🚦). 여기 도달했다면 데이터 결함이므로 조용히 삼키지 않는다.
        throw new Error(
          `[cutoff] page=${currentPage}가 속한 장을 찾을 수 없어 스냅샷을 만들지 않는다: bookId=${bookId}`
        );
      }

      // ── 파생 계산: 이 블록이 시스템 전체의 유일한 계산 지점이다 ──────────────
      const cutoff = currentPage - 1; // FR-PRG-003 🚦 — 스포일러 상한 K
      const percent = round(
        (currentPage / totalPages) * 100, // FR-BRF-005 🚦 — 단일 원천
        PERCENT_DECIMALS
      );
      // ───────────────────────────────────────────────────────────────────────

      return {
        current_page: currentPage,
        cutoff,
        percent,
        chapter: {
          chapter_no: chapter.chapter_no,
          title: chapter.title,
        },
      };
    },
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
