/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ENV: string;
  readonly VITE_USE_MOCK: string;
  /**
   * 시연·검증용 고정 디바이스 식별자. 백엔드 데모 스크립트의 `DEMO_DEVICE_ID` 와 짝이다.
   * 비워 두면 브라우저가 최초 실행 시 UUID 를 생성한다 (team-sync §4.8).
   */
  readonly VITE_DEMO_DEVICE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
