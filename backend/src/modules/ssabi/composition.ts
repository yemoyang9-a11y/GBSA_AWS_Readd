/**
 * 싸비 모듈 조립 (R3)
 *
 * Round 1-3에서 routes.ts에 추가:
 * import { createSsabiServices } from '../modules/ssabi/composition';
 * const ssabi = createSsabiServices(pool);
 */

import type { Pool } from 'pg';
import type { SsabiRepository } from './repository';

/**
 * 싸비 서비스 집합
 */
export interface SsabiServices {
  repository: SsabiRepository;
  // graph: GraphService;  // Round 2에서 추가
}

/**
 * 싸비 서비스 조립
 *
 * @param pool - PostgreSQL 연결 풀
 * @returns 싸비 서비스 집합
 */
export function createSsabiServices(pool: Pool): SsabiServices {
  // TODO: Round 0 완료 후 실제 어댑터 연결
  // const repository = createSsabiRepositoryAdapter(pool);

  throw new Error('Not implemented: createSsabiServices - Round 1 작업 대기 중');
}
