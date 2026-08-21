/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// VITE_API_URL 로 백엔드를 가리킨다 (.env.example 참조)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    /**
     * 테스트는 항상 mock 대역을 쓴다 — 로컬 `.env` 설정에 흔들리지 않게 여기서 고정한다.
     * 실 DB E2E 를 하려고 `.env` 의 VITE_USE_MOCK 을 false 로 바꾸면 통합 테스트가
     * 실제 백엔드를 보려 해서 무더기로 깨진다(실제로 겪었다). 테스트는 대역 기준으로
     * 작성돼 있고, 실 API 검증은 브라우저 E2E 의 몫이다.
     *
     * 디바이스 식별자도 고정하지 않는다 — 테스트는 브라우저가 생성한 UUID 경로를 그대로 타야 한다.
     */
    env: {
      VITE_USE_MOCK: 'true',
      VITE_DEMO_DEVICE_ID: '',
    },
  },
});
