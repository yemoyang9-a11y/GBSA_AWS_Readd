/**
 * S6 게이트 테스트 — 브리핑 조립
 *
 * 근거: dev-spec-R2-core.md S6 · architecture-r1.md 4.1절("첫 진입 브리핑" 확정) · ❓Q1
 * S6도 4.5절 표에 전용 항목이 없다 — S6 본문·R8·FR-BRF-005·❓Q1을 근거로 작성했다.
 */

import { createBriefingService } from '../../../src/modules/reading-state/briefing.service';
import { createCutoffService } from '../../../src/modules/reading-state/cutoff.service';
import { SEED_BOOK_ID, SEED_DEVICE_ID, FakeSavedRecapRepository, makeSeededFakes } from './fakes';

function build() {
  const { positions, books } = makeSeededFakes();
  const cutoffService = createCutoffService({ positions, books });
  const savedRecap = new FakeSavedRecapRepository();
  const service = createBriefingService({ cutoffService, books, savedRecap });
  return { positions, books, savedRecap, service };
}

describe('브리핑 조립 — getBriefing', () => {
  test('❓Q1: 첫 진입(cutoff=0)은 recap: null이지만 applied_cutoff=0으로 폴백 대상이 아님을 알린다', async () => {
    const { service } = build();

    const briefing = await service.getBriefing(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(briefing.applied_cutoff).toBe(0);
    expect(briefing.recap).toBeNull();
    expect(briefing.progress.current_page).toBe(1);
  });

  test('R8: 저장 리캡.기준점 == K → 그대로 반환', async () => {
    const { positions, savedRecap, service } = build();
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 16, event_seq: 1 }); // K=16
    savedRecap.set(SEED_DEVICE_ID, SEED_BOOK_ID, { cutoff_page: 16, recap_text: '저장된 리캡' });

    const briefing = await service.getBriefing(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(briefing.applied_cutoff).toBe(16);
    expect(briefing.recap).toBe('저장된 리캡');
  });

  test('R8: 저장 리캡.기준점 != K → 무효 처리, recap: null (폴백 대상 — applied_cutoff > 0)', async () => {
    const { positions, savedRecap, service } = build();
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 16, event_seq: 1 }); // K=16
    savedRecap.set(SEED_DEVICE_ID, SEED_BOOK_ID, { cutoff_page: 5, recap_text: '옛 리캡' });

    const briefing = await service.getBriefing(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(briefing.applied_cutoff).toBe(16);
    expect(briefing.recap).toBeNull();
  });

  test('저장 리캡 부재 → recap: null (폴백 대상)', async () => {
    const { positions, service } = build();
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 16, event_seq: 1 });

    const briefing = await service.getBriefing(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(briefing.applied_cutoff).toBe(16);
    expect(briefing.recap).toBeNull();
  });

  test('FR-BRF-005 🚦: current_chapter·progress가 기준점 결정기 스냅샷과 동일 원천', async () => {
    const { positions, service } = build();
    positions.set(SEED_DEVICE_ID, SEED_BOOK_ID, { current_page: 15, event_seq: 1 });

    const briefing = await service.getBriefing(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(briefing.current_chapter).toEqual({ chapter_no: 2, title: '제2장 불효자식' });
    expect(briefing.progress).toEqual({ current_page: 15, total_pages: 30, percent: 50 });
  });

  test('K가 0이면 저장 리캡 조회 자체를 하지 않는다 (첫 진입은 재사용 판정 대상이 아니다)', async () => {
    const { savedRecap, service } = build();
    // 저장분이 있어도(다른 디바이스 흔적 등) K=0 경로는 무시하고 빈 상태로 답해야 한다
    savedRecap.set(SEED_DEVICE_ID, SEED_BOOK_ID, {
      cutoff_page: 0,
      recap_text: '있을 수 없는 저장분',
    });

    const briefing = await service.getBriefing(SEED_DEVICE_ID, SEED_BOOK_ID);

    expect(briefing.applied_cutoff).toBe(0);
    expect(briefing.recap).toBeNull();
  });
});
