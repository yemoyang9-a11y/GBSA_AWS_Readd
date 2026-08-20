/**
 * 벡터 검색 테스트
 *
 * FR-QNA-006 🚦: 검색 결과에 기준점 초과 레코드 0건
 */

import { validateSearchResults } from '../vector-search';
import type { SearchChunk } from '../../../shared/types';

describe('벡터 검색 - FR-QNA-006 🚦', () => {
  describe('validateSearchResults', () => {
    test('FR-QNA-006: 검색 결과에 page_no > K인 레코드 0건', () => {
      const K = 80;
      const results: SearchChunk[] = [
        { page_no: 50, content: '...', distance: 0.15 },
        { page_no: 75, content: '...', distance: 0.20 },
        { page_no: 80, content: '...', distance: 0.25 }, // 경계값
      ];

      const validation = validateSearchResults(results, K);

      expect(validation.valid).toBe(true);
      expect(validation.violations).toHaveLength(0);
    });

    test('FR-QNA-006: page_no > K인 레코드가 있으면 invalid', () => {
      const K = 80;
      const results: SearchChunk[] = [
        { page_no: 50, content: '...', distance: 0.15 },
        { page_no: 81, content: '...', distance: 0.10 }, // 위반!
        { page_no: 85, content: '...', distance: 0.12 }, // 위반!
      ];

      const validation = validateSearchResults(results, K);

      expect(validation.valid).toBe(false);
      expect(validation.violations).toEqual([81, 85]);
    });

    test('FR-QNA-006: 경계값 K는 포함 (page_no = K는 valid)', () => {
      const K = 100;
      const results: SearchChunk[] = [
        { page_no: 99, content: '...', distance: 0.15 },
        { page_no: 100, content: '...', distance: 0.20 }, // K = 100, valid
      ];

      const validation = validateSearchResults(results, K);

      expect(validation.valid).toBe(true);
      expect(validation.violations).toHaveLength(0);
    });

    test('FR-QNA-006: 빈 결과는 항상 valid', () => {
      const K = 80;
      const results: SearchChunk[] = [];

      const validation = validateSearchResults(results, K);

      expect(validation.valid).toBe(true);
      expect(validation.violations).toHaveLength(0);
    });
  });
});

describe('벡터 검색 사전 필터 - negative + positive 쌍', () => {
  // 이 테스트는 실제 vectorSearch 함수를 mock repository와 함께 테스트
  // Mock을 사용해 "사전 필터가 제대로 적용되는지" 검증

  test('Negative: K=80일 때 page_no=85 청크는 검색되지 않음', async () => {
    // TODO: repository mock 추가 후 구현
    // const results = await vectorSearch(bookId, query, 80);
    // expect(results.every(r => r.page_no <= 80)).toBe(true);
  });

  test('Positive: K=130일 때 page_no=85 청크는 검색됨', async () => {
    // TODO: repository mock 추가 후 구현
    // const results = await vectorSearch(bookId, query, 130);
    // const has85 = results.some(r => r.page_no === 85);
    // expect(has85).toBe(true);
  });
});
