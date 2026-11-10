/** 전역 상수 */

/** 백엔드 주소 — .env 의 VITE_API_URL (기본 http://localhost:3000) */
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * 백엔드 대역(src/mocks) 사용 여부.
 * R2·R4 엔드포인트가 아직 501 스텁이라, 화면 개발 동안 켜 둔다 (dev-spec-R4-frontend.md §3).
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

/** localStorage 키 */
export const STORAGE_KEYS = {
  /** 디바이스 식별자 — 8/20 팀 결정으로 클라이언트가 생성한다 (team-sync-r4.md §4.8) */
  deviceId: 'ssabi.device_id',
} as const;

/** 하트비트 주기 5분 (A2) */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/** 첫 진입(cutoff = 0) 빈 상태 문구. 이 경우 스트리밍 폴백을 호출하지 않는다 (D13 ①) */
export const EMPTY_RECAP_MESSAGE = '아직 읽은 내용이 없습니다';

/** 싸비 최초 열기 기본 탭 (FR-SVB-002) */
export const DEFAULT_SSABI_TAB = 'relationship' as const;

/** 인물 관계도 최초 토글 값 (FR-CHR-001) */
export const DEFAULT_CHARACTER_MODE = 'major' as const;
