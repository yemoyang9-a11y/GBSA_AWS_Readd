// Jest 환경 설정
process.env.NODE_ENV = 'test';
// 단일 기본 모델 (2026-08-25) — 난이도 분기 폐지.
// 2026-08-29: Bedrock → Anthropic API 이관. 모델 ID에 리전 접두사·날짜·버전 접미사가
// 붙지 않는다 — Anthropic API의 정식 ID는 `claude-haiku-4-5` 하나로 완결돼 있다.
process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5';
process.env.ANTHROPIC_EFFORT = ''; // 기본 모델(Haiku 4.5)은 effort를 못 받는다
// 테스트는 네트워크를 타지 않지만, model-config의 validateModelVersions가 키 부재로
// 던지므로(부팅 가드) 더미 값을 넣는다. 실제 호출에 쓰이지 않는다.
process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
process.env.COHERE_API_KEY = 'test-key-not-used';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'readd_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
