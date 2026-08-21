/**
 * 공통 API 클라이언트.
 *
 * 디바이스 식별은 헤더 X-Device-Id 로만 한다 (API_CONTRACT '인증(간소화)').
 *
 * 발급 주체는 8/20 팀 결정으로 **클라이언트가 최초 실행 시 생성**한다. API_CONTRACT.md
 * 원문은 "서버가 첫 요청 시 생성해서 반환"이라고 돼 있지만, R2·R3 둘 다 이미 헤더가 없으면
 * 400으로 거절하도록 구현해뒀다(team-sync-r4.md §4.8) — 서버가 발급할 자리가 실제로는
 * 없었다. 서버 쪽 수정 없이 맞출 수 있는 이 방식으로 팀 결정.
 */

import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { getDeviceId, setDeviceId } from '../utils/storage';

/**
 * 디바이스 식별자를 확보한다.
 *
 * `VITE_DEMO_DEVICE_ID` 가 설정돼 있으면 그 값을 쓴다 — 백엔드 데모 스크립트
 * (`run-seed-demo-state.ts`·`run-inject-demo-recap.ts`)가 `DEMO_DEVICE_ID` 로 같은
 * 규약을 쓰고 있어 짝을 맞춘 것이다. 이게 없으면 브라우저가 매번 새 UUID 를 만들어
 * 시연용으로 적재해 둔 진도·저장 리캡을 볼 수 없다 (실제로 E2E 에서 겪었다 —
 * 시드는 K=100 인데 브라우저는 자기 디바이스로 1페이지부터 시작했다).
 *
 * 설정하지 않으면 종전대로 최초 실행 시 UUID 를 생성한다 (8/20 팀 결정, team-sync §4.8).
 */
function ensureDeviceId(): string {
  const demo = import.meta.env.VITE_DEMO_DEVICE_ID;
  if (typeof demo === 'string' && demo.length > 0) {
    if (getDeviceId() !== demo) setDeviceId(demo);
    return demo;
  }

  const existing = getDeviceId();
  if (existing) return existing;
  const generated = crypto.randomUUID();
  setDeviceId(generated);
  return generated;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  config.headers['X-Device-Id'] = ensureDeviceId();
  return config;
});

/** 서버가 값을 바꿔서 내려주는 경우를 대비한 방어적 동기화 (현재 계약상 발생하지 않는다) */
api.interceptors.response.use((response) => {
  const issued = response.headers['x-device-id'];
  if (typeof issued === 'string' && issued.length > 0 && issued !== getDeviceId()) {
    setDeviceId(issued);
  }
  return response;
});
