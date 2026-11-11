import { ensureDeviceId } from './api';
import { getDeviceId, setDeviceId } from '../utils/storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('ensureDeviceId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('FR-PRG-003: 환경변수가 있어도 쓰지 않고 브라우저가 만든 UUID 를 저장·재사용한다', () => {
    const fixed = '11111111-1111-4111-8111-111111111111';
    vi.stubEnv('VITE_DEMO_DEVICE_ID', fixed);

    const first = ensureDeviceId();

    expect(first).not.toBe(fixed);
    expect(first).toMatch(UUID);
    expect(getDeviceId()).toBe(first);
    expect(ensureDeviceId()).toBe(first);
  });

  it('FR-PRG-003: 저장된 기기 ID 가 있으면 그 값을 그대로 쓴다', () => {
    setDeviceId('stored-device');

    expect(ensureDeviceId()).toBe('stored-device');
    expect(getDeviceId()).toBe('stored-device');
  });
});
