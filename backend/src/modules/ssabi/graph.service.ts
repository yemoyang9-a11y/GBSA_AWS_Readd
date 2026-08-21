/**
 * GET /books/:bookId/ssabi/graph — 관계도 조회 (R3)
 *
 * 조항: FR-CHR-001, FR-SPL-002 🚦, A6
 *
 * @see query-endpoints-split.md Task 7
 */

import type { RelationshipGraph } from '../../shared/types';
import type { SsabiRepository } from './repository';

export interface GraphServiceDeps {
  repository: SsabiRepository;
}

export interface GraphService {
  /**
   * 관계도 그래프 조회
   *
   * FR-SPL-002 🚦: cutoff 기준 필터링
   * A6: 관계는 최신 라벨만 표시
   *
   * @param bookId - 도서 ID
   * @param cutoff - 기준점 (스포일러 상한)
   * @returns 관계도 그래프 JSON
   */
  getGraph(bookId: string, cutoff: number): Promise<RelationshipGraph>;
}

/**
 * 관계도 서비스 생성
 */
export function createGraphService(deps: GraphServiceDeps): GraphService {
  const { repository } = deps;

  return {
    async getGraph(bookId: string, cutoff: number): Promise<RelationshipGraph> {
      // FR-SPL-002 🚦: repository.getGraph가 cutoff 적용
      return repository.getGraph(bookId, cutoff);
    },
  };
}
