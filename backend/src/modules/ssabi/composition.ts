/**
 * 싸비 모듈 조립 (R3)
 *
 * Round 1-3에서 routes.ts에 추가:
 * import { createSsabiServices } from '../modules/ssabi/composition';
 * const ssabiServices = createSsabiServices(pool);
 */

import type { Pool } from 'pg';
import type { SsabiRepository } from './repository';
import { createPgSsabiRepository, type QueryClient } from './pg-repository';
import { createGraphService, type GraphService } from './graph.service';

/**
 * 싸비 서비스 집합
 */
export interface SsabiServices {
  repository: SsabiRepository;
  graph: GraphService;
}

function toQueryClient(pool: Pool): QueryClient {
  return { query: (sql: string, params?: unknown[]) => pool.query(sql, params) };
}

/**
 * 싸비 서비스 조립
 *
 * @param pool - PostgreSQL 연결 풀
 * @returns 싸비 서비스 집합
 */
export function createSsabiServices(pool: Pool): SsabiServices {
  const db = toQueryClient(pool);
  const repository = createPgSsabiRepository(db);

  return {
    repository,
    graph: createGraphService({ repository }),
  };
}
