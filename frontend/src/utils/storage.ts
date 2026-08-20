/**
 * localStorage 헬퍼.
 * 디바이스 식별자는 8/20 팀 결정으로 **클라이언트가 최초 실행 시 생성**한다
 * (team-sync-r4.md §4.8 — API_CONTRACT.md 원문과 다르지만, R2·R3가 이미 헤더 없는 요청을
 * 400으로 거절하도록 구현해둔 실제 동작에 맞춘 결정. services/api.ts 의 ensureDeviceId 참조).
 */

import { STORAGE_KEYS } from './constants';

export function getDeviceId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.deviceId);
}

export function setDeviceId(deviceId: string): void {
  localStorage.setItem(STORAGE_KEYS.deviceId, deviceId);
}
