/**
 * 세션 종료 스위퍼 — 별도 실행 단위 (R2, S4)
 *
 * @see dev-spec-R2-core.md S4
 * @see architecture-r1.md 4.4.1절
 *
 * 조항: FR-DAT-009 (저장 리캡 1건, 진도 무관) · A7 (대화 이력 파기) · NFR-AI-016 (실패가
 *      사용자 동선을 막지 않음)
 *
 * 클라이언트의 탭 닫기·백그라운드 전환 감지는 신뢰할 수 없으므로 감지를 클라이언트에
 * 시키지 않는다 — 서버 데이터(`last_activity_at`)만으로 세션 종료를 판정한다.
 *
 * 스케줄(주기 1분, A3)로 이 모듈의 `runSweep`을 반복 호출하는 것은 배포 계층(4.8절 —
 * 별도 실행 단위)의 몫이며 이 파일에는 스케줄러를 두지 않는다.
 */

import type { Clock } from '../../modules/reading-state/clock';
import type { CutoffService } from '../../modules/reading-state/cutoff.service';
import type { RecapService } from '../../modules/reading-state/recap.service';
import type {
  ConversationHistoryRepository,
  ReadingSessionRepository,
} from '../../modules/reading-state/repository';
import { SESSION_TIMEOUT_MS } from '../../modules/reading-state/session.service';

export interface SweepDeps {
  sessions: ReadingSessionRepository;
  cutoffService: CutoffService;
  recapService: RecapService;
  conversationHistory: ConversationHistoryRepository;
  clock: Clock;
}

export interface SweepReport {
  processed: number;
  /** `deviceId::bookId` 목록 — 실패해도 스윕은 계속되므로(NFR-AI-016) 관측용으로 남긴다. */
  failed: string[];
}

/**
 * 대상(`recap_state='none' AND last_activity_at < now - 30분`)을 스캔해 각각
 * cutoff 스냅샷을 확보하고, 세션 종료 잡(리캡 재종합 → 저장 리캡 upsert)을 실행한 뒤
 * 대화 이력을 파기한다. 한 대상의 실패가 다른 대상 처리를 막지 않는다.
 */
export async function runSweep(deps: SweepDeps): Promise<SweepReport> {
  const { sessions, cutoffService, recapService, conversationHistory, clock } = deps;

  const before = new Date(clock.now().getTime() - SESSION_TIMEOUT_MS);
  const targets = await sessions.findSweepTargets(before);

  let processed = 0;
  const failed: string[] = [];

  for (const target of targets) {
    // 상태를 먼저 선점한다 — 다음 스캔(1분 주기)이 처리 중인 대상을 다시 집지 않는다
    // (4.4.1절, 멱등·자기 교정 구조를 깨는 최적화를 하지 않는다).
    await sessions.markPending(target.device_id, target.book_id);

    try {
      const snapshot = await cutoffService.getCutoffSnapshot(target.device_id, target.book_id);
      const result = await recapService.getRecap(
        target.device_id,
        target.book_id,
        snapshot.cutoff,
        'session_end' // R7 — 진도 무관, 재사용 판정 없이 항상 재종합. 저장 리캡 적재는 recap.service 내부에서 완료된다
      );
      if (result.kind === 'generated') {
        for await (const _chunk of result.chunks) {
          // 세션 종료 잡은 백그라운드이므로 스트리밍이 필요 없다 — 완전히 소비해 저장
          // 리캡 upsert(recap.service 내부 부작용)까지 끝나도록 드레인만 한다.
        }
      }
      // result.kind === 'empty'는 K=0(진도 없이 세션이 끝난 경우) — 만들 내용이 없으므로
      // 저장 리캡도 없다. 실패가 아니라 정상 케이스다.

      await sessions.markDone(target.device_id, target.book_id);
      processed++;
    } catch {
      // 재시도 후 'failed' — 사용자 동선(브리핑 폴백)이 흡수한다 (NFR-AI-016)
      await sessions.markFailed(target.device_id, target.book_id);
      failed.push(`${target.device_id}::${target.book_id}`);
    }

    await conversationHistory.purge(target.device_id, target.book_id); // A7 — 질의 로그는 별도 테이블, 대상 아님
  }

  return { processed, failed };
}
