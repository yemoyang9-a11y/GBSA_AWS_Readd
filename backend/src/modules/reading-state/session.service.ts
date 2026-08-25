/**
 * 진입 판정 + 하트비트 — 세션 30분 규칙의 서버 단독 평가 (R2, S3)
 *
 * @see dev-spec-R2-core.md S3
 * @see architecture-r1.md 4.4.1절 — 세션 종료 스위퍼와 판정 기준을 공유한다
 *
 * 조항: FR-BRF-001 (세션 30분 규칙, 브리핑 1회 경유) · FR-BRW-002 🚦 (미완비 도서 진입 거절)
 *      · R6 (세션 = 무조작 30분) · A2 (조작의 범위)
 *
 * ⚠️ 세션 판정은 클라이언트가 하지 않는다 — 이 서비스가 `last_activity_at`에서 직접
 *    평가한다. 스위퍼(S4) 처리 여부와 무관하게 독립적으로 판정하므로, 스윕 지연이
 *    브리핑 노출 여부를 흔들지 않는다 (FR-BRF-001 AC, 4.4.1절 "재진입 판정과의 분리").
 */

import { FIRST_ENTRY_PAGE } from './cutoff.service';
import type { Clock } from './clock';
import type {
  BookMetaReader,
  ReadingPositionRepository,
  ReadingSessionRepository,
} from './repository';

/**
 * 무조작 30분 — 세션 경계 (R6, FR-DAT-009).
 * 스위퍼(S4, session-sweeper/sweep.ts)가 대상을 선별할 때 같은 값을 가져다 쓴다 —
 * 두 곳에서 30분을 따로 정의하면 판정 지점이 둘로 갈린다(FR-BRF-005 🚦와 같은 결의).
 *
 * ⚠️ **명세값은 30분이고 기본값을 바꾸지 않았다.** `SESSION_TIMEOUT_MS` 환경변수가
 *    설정된 경우에만 그 값으로 덮는다 — 시연 리허설에서 브리핑 화면(FR-BRF-001)을
 *    반복해 확인하려면 매번 세션 행을 지워야 하는데, 검증 중에는 그게 번거롭다.
 *    0 으로 두면 진입할 때마다 새 세션이 되어 브리핑을 항상 거친다.
 *
 *    **검증용이며 배포 환경에는 설정하지 않는다.** 값을 넣으면 R6 의 세션 경계가
 *    그만큼 달라지고, 스위퍼도 같은 상수를 쓰므로 세션 종료 판정까지 함께 움직인다.
 */
const SPEC_SESSION_TIMEOUT_MS = 30 * 60_000;

function resolveSessionTimeout(): number {
  const raw = process.env.SESSION_TIMEOUT_MS;
  if (raw === undefined || raw === '') return SPEC_SESSION_TIMEOUT_MS;

  const parsed = Number(raw);
  // 숫자가 아니거나 음수면 명세값으로 되돌린다 — 오타 하나로 세션 규칙이 조용히 깨지지 않게
  if (!Number.isFinite(parsed) || parsed < 0) return SPEC_SESSION_TIMEOUT_MS;

  return parsed;
}

export const SESSION_TIMEOUT_MS = resolveSessionTimeout();

export class BookNotReadyError extends Error {
  constructor(readonly bookId: string) {
    super(`[session] 미완비 도서는 진입을 거절한다: bookId=${bookId}`); // FR-BRW-002 🚦
  }
}

export interface EntryDecision {
  route: 'briefing' | 'reader';
  page: number;
  is_new_session: boolean;
  /** route와 무관하게 항상 반환한다. 값이 바뀌면 새 세션이다 (R4 CP0 회신 항목 1) */
  session_epoch: number;
}

export interface SessionServiceDeps {
  positions: ReadingPositionRepository;
  books: BookMetaReader;
  sessions: ReadingSessionRepository;
  clock: Clock;
}

export interface SessionService {
  /**
   * 진입 판정. 미완비 도서는 던진다(FR-BRW-002 🚦, 실패 = 미노출 원칙과 동일한 결의 —
   * R11). 세션 30분 규칙을 평가해 브리핑/읽기 화면 라우팅을 결정하고, 판정 후
   * `last_activity_at`을 갱신한다(A2 조작 4종 중 하나).
   */
  decideEntry(deviceId: string, bookId: string): Promise<EntryDecision>;

  /**
   * 화면 가시 상태의 5분 주기 하트비트. `last_activity_at`만 갱신한다 — 진도·기준점에
   * 관여하지 않는다(A2).
   */
  acceptHeartbeat(deviceId: string, bookId: string): Promise<void>;

  /**
   * "조작 이벤트 수신" 공통 갱신. 진도 이벤트·리캡/챗봇 요청 등 R2가 소유하지 않는
   * 호출부(라우트 핸들러)가 자신의 처리 뒤 이 함수를 불러 세션을 살린다(4.4.1절 A2
   * "서버 도달 이벤트 4종"). 세션 판단(신규 여부)은 하지 않는다 — 그건 decideEntry뿐이다.
   */
  touchActivity(deviceId: string, bookId: string): Promise<void>;
}

export function createSessionService(deps: SessionServiceDeps): SessionService {
  // clock은 이 함수 안에서 더 이상 쓰이지 않는다 — 30분 경과 비교(clock.now() 기준)를
  // 없앴기 때문(위 decideEntry 주석). SessionServiceDeps 인터페이스에는 남겨 둔다 —
  // composition.ts가 다른 서비스(스위퍼 등)와 같은 clock을 공유해 넘기는 배선이라
  // 이 함수 시그니처만 바뀌면 호출부를 건드리게 된다.
  const { positions, books, sessions } = deps;

  return {
    async decideEntry(deviceId: string, bookId: string): Promise<EntryDecision> {
      const ready = await books.findReadiness(bookId);
      if (!ready) {
        throw new BookNotReadyError(bookId); // FR-BRW-002 🚦 — 존재하지 않는 도서도 포함
      }

      /**
       * (2026-08-25, 사용자 요청 — 데모 기간 임시 조치) 원래 R6/FR-BRF-001은 여기서
       * `session.last_activity_at`과 SESSION_TIMEOUT_MS(위 상수, 스위퍼와 공유)를 비교해
       * 30분 무조작이어야 새 세션(브리핑)으로 판정했다. 데모에서는 진입할 때마다 항상
       * 브리핑을 거쳐야 해서 그 비교를 없애고 매번 새 세션으로 취급한다.
       *
       * ⚠️ 스위퍼(session-sweeper/sweep.ts)의 SESSION_TIMEOUT_MS 사용은 건드리지
       *    않았다 — 그건 "세션 종료 시 저장 리캡 재종합"이라는 별개 배치 작업이고, 실제
       *    30분 무조작 경과로만 동작해야 한다(안 그러면 리캡 재생성이 반복 트리거된다).
       *    여기서 없앤 건 "진입 시 브리핑/읽기 화면 라우팅 판정" 하나뿐이다.
       *
       * 원복하려면 이 줄 대신 아래를 되돌린다:
       *   const session = await sessions.findSession(deviceId, bookId);
       *   const isNewSession =
       *     session === null ||
       *     clock.now().getTime() - session.last_activity_at.getTime() >= SESSION_TIMEOUT_MS;
       * (git log — 이 커밋 직전 버전 참조)
       */
      const isNewSession = true;

      // R4 CP0 회신 항목 2 — "POST /entry를 받으면 항상 event_seq를 0으로 리셋한다"
      // (frontend/src/utils/seq.ts 주석, 8/20 확정). 새 세션 여부와 무관하게 매번 리셋해야
      // 한다 — 예전엔 isNewSession 일 때만 리셋해서, 같은 세션 안에서 새로고침 등으로
      // /entry가 다시 불리면 프론트 로컬 seq(0부터 재시작)가 서버에 남아 있던 더 큰
      // event_seq보다 항상 작아져 이후 모든 진도·챗봇·리캡 요청이 FR-PRG-002의 "더 새로운
      // seq만 수용" 규칙에 막혀 조용히 버려졌다 — 화면은 페이지가 넘어가는데 저장된 위치·
      // 기준점(K)은 버그가 터진 시점에 영원히 멈추는 증상으로 나타났다.
      await positions.resetEventSeq(deviceId, bookId);

      // isNewSession이 항상 true라(위 주석) 예전 "기존 세션 유지" 분기(recordActivity +
      // 기존 epoch 재사용)는 도달하지 않는다 — 그 분기를 남겨두면 죽은 코드가 되므로 제거했다.
      const result = await sessions.startNewSession(deviceId, bookId);
      const sessionEpoch = result.session_epoch;

      const stored = await positions.findPosition(deviceId, bookId);
      const page = stored?.current_page ?? FIRST_ENTRY_PAGE;

      return {
        route: isNewSession ? 'briefing' : 'reader', // R6 — 브리핑은 새 세션 진입 시 1회 (지금은 항상 briefing)
        page,
        is_new_session: isNewSession,
        session_epoch: sessionEpoch,
      };
    },

    async acceptHeartbeat(deviceId: string, bookId: string): Promise<void> {
      await sessions.recordActivity(deviceId, bookId); // A2 — 진도·기준점 비관여
    },

    async touchActivity(deviceId: string, bookId: string): Promise<void> {
      await sessions.recordActivity(deviceId, bookId);
    },
  };
}
