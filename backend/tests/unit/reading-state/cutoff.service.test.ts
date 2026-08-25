/**
 * S1 게이트 테스트 — 기준점 결정기
 *
 * 근거: dev-spec-R2-core.md 4.5절 자가 검증 표 1~3번
 *       (4번 정적 검색은 tests/static/derived-value-single-source.test.ts)
 *
 * 테스트 규약 3.2절에 따라 구현 전에 작성했다. 조항 문구를 테스트 이름에 그대로 넣는다.
 */

import { createCutoffService } from '../../../src/modules/reading-state/cutoff.service';
import { SEED_BOOK, SEED_BOOK_ID, SEED_DEVICE_ID, makeSeededFakes } from './fakes';

function serviceWith(currentPage: number | null) {
  const { positions, books } = makeSeededFakes();
  if (currentPage !== null) {
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      current_page: currentPage,
      event_seq: 1,
    });
  }
  return createCutoffService({ positions, books });
}

describe('기준점 결정기 — getCutoffSnapshot', () => {
  test('FR-PRG-003 🚦: 진도가 있으면 모든 페이지에서 cutoff == current_page', async () => {
    for (let page = 1; page <= SEED_BOOK.total_pages; page++) {
      const snapshot = await serviceWith(page).getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);

      expect(snapshot.current_page).toBe(page);
      expect(snapshot.cutoff).toBe(page);
    }
  });

  test('1페이지도 예외가 아니다 — 펼쳐서 읽는 중이면 cutoff = 1', async () => {
    // 화면에 이미 떠 있는 페이지는 새로운 노출이 아니다(R3). 1페이지를 읽는 독자도
    // 그 페이지 기준의 리캡·관계도·챗봇 근거를 받아야 한다.
    const snapshot = await serviceWith(1).getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(snapshot.current_page).toBe(1);
    expect(snapshot.cutoff).toBe(1);
  });

  test('3.3절 경계값: 진도 레코드가 아예 없으면(책을 한 번도 열지 않음) cutoff = 0', async () => {
    // 표시용 current_page는 1이지만 cutoff는 0이다 — 브리핑 화면이 1페이지 줄거리를
    // 미리 흘리지 않게 한다. 두 상태는 current_page로 구별되지 않으므로 레코드 유무로 가른다.
    const snapshot = await serviceWith(null).getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(snapshot.current_page).toBe(1);
    expect(snapshot.cutoff).toBe(0);
  });

  test('FR-PRG-003: 역방향 이동에도 cutoff가 따라 내려간다 (앞뒤 모두)', async () => {
    const { positions, books } = makeSeededFakes();
    const service = createCutoffService({ positions, books });

    // 정방향 — p.25까지 읽었다
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 25, event_seq: 10 });
    const forward = await service.getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(forward.cutoff).toBe(25);

    // 역방향 — 목차로 p.5로 되돌아갔다. watermark는 존재하지 않는다 (R2 불변식)
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 5, event_seq: 11 });
    const backward = await service.getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(backward.cutoff).toBe(5);
    expect(backward.cutoff).toBeLessThan(forward.cutoff);
  });

  test('FR-BRF-005 🚦: percent가 스냅샷 단일 원천에서 나온다 (current_page / total_pages)', async () => {
    // API_CONTRACT.md 예시(80 / 340 → 23.5)와 같은 규칙: 백분율, 소수 1자리
    const snapshot = await serviceWith(15).getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(snapshot.percent).toBe(50); // 15 / 30
  });

  test('FR-BRF-005 🚦: 첫 진입(진도 부재)의 percent도 같은 규칙으로 파생된다', async () => {
    const snapshot = await serviceWith(null).getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(snapshot.percent).toBe(3.3); // 1 / 30 → 3.33... → 3.3
  });

  describe('chapter — current_page가 속한 장 (목차는 전체 상시 노출 — R3 불변식)', () => {
    test('장 중간: p.15 → 2장', async () => {
      const snapshot = await serviceWith(15).getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);
      expect(snapshot.chapter.chapter_no).toBe(2);
      expect(snapshot.chapter.title).toBe('제2장 불효자식');
    });

    test('장 시작 페이지: p.11 → 2장', async () => {
      const snapshot = await serviceWith(11).getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);
      expect(snapshot.chapter.chapter_no).toBe(2);
    });

    test('장 종료 페이지: p.10 → 1장 (다음 장으로 넘어가지 않는다)', async () => {
      const snapshot = await serviceWith(10).getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);
      expect(snapshot.chapter.chapter_no).toBe(1);
    });

    test('마지막 페이지: p.30 → 3장', async () => {
      const snapshot = await serviceWith(30).getCutoffSnapshot(SEED_DEVICE_ID, SEED_BOOK_ID);
      expect(snapshot.chapter.chapter_no).toBe(3);
      expect(snapshot.percent).toBe(100);
    });
  });

  describe('데이터 정합성 결함은 조용히 삼키지 않는다 (실패 = 미노출 — FR-SPL-005 🚦)', () => {
    test('도서가 없으면 스냅샷을 만들지 않는다', async () => {
      const { positions, books } = makeSeededFakes();
      const service = createCutoffService({ positions, books });

      await expect(service.getCutoffSnapshot(SEED_DEVICE_ID, 'unknown-book')).rejects.toThrow(
        /total_pages/
      );
    });

    test('장 커버리지가 비면 스냅샷을 만들지 않는다 (FR-DAT-001 🚦 결함)', async () => {
      const { positions, books } = makeSeededFakes();
      books.set('gap-book', { total_pages: 30, chapters: [] });
      positions.set(SEED_DEVICE_ID, 'gap-book', { current_page: 15, event_seq: 1 });
      const service = createCutoffService({ positions, books });

      await expect(service.getCutoffSnapshot(SEED_DEVICE_ID, 'gap-book')).rejects.toThrow(/장/);
    });
  });
});
