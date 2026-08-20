/**
 * 독서 상태 서비스 조합 (R2 담당)
 *
 * TODO: R2 구현 시 실제 서비스로 교체
 */

import type { Pool } from 'pg';

export interface CutoffSnapshot {
  current_page: number;
  cutoff: number;
  percent: number;
  chapter: number | null;
}

export interface ProgressEvent {
  page: number;
  seq: number;
}

export interface ReadingStateServices {
  progressService: {
    acceptProgressEvent(deviceId: string, bookId: string, event: ProgressEvent): Promise<void>;
  };
  sessionService: {
    touchActivity(deviceId: string, bookId: string): Promise<void>;
  };
  cutoffService: {
    getCutoffSnapshot(deviceId: string, bookId: string): Promise<CutoffSnapshot>;
  };
}

/**
 * 독서 상태 서비스 생성
 *
 * TODO: R2 구현 전 임시 스텁
 */
export function createReadingStateServices(_pool: Pool): ReadingStateServices {
  return {
    progressService: {
      async acceptProgressEvent(deviceId: string, bookId: string, event: ProgressEvent): Promise<void> {
        console.log('[ReadingState STUB] acceptProgressEvent', { deviceId, bookId, event });
        // TODO: R2 구현 - reading_position 업데이트
      },
    },
    sessionService: {
      async touchActivity(deviceId: string, bookId: string): Promise<void> {
        console.log('[ReadingState STUB] touchActivity', { deviceId, bookId });
        // TODO: R2 구현 - reading_sessions 업데이트
      },
    },
    cutoffService: {
      async getCutoffSnapshot(deviceId: string, bookId: string): Promise<CutoffSnapshot> {
        console.log('[ReadingState STUB] getCutoffSnapshot', { deviceId, bookId });
        // TODO: R2 구현 - 실제 DB에서 조회
        // FR-PRG-003 🚦: cutoff = current_page - 1
        return {
          current_page: 81,
          cutoff: 80,
          percent: 0.4,
          chapter: 3,
        };
      },
    },
  };
}
