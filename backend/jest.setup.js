// Jest 환경 설정
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
// 단일 기본 모델 (2026-08-25) — 난이도 분기 폐지. BEDROCK_CLAUDE_SONNET/HAIKU는 더 이상
// 매핑에 쓰이지 않지만, 옛 값을 참조하는 테스트가 남아 있는지 드러나도록 남겨 둔다.
process.env.BEDROCK_MODEL = 'anthropic.claude-3-haiku-20240307-v1:0';
process.env.BEDROCK_EFFORT = ''; // 기본 모델(Haiku)은 effort를 못 받는다
process.env.BEDROCK_CLAUDE_SONNET = 'anthropic.claude-sonnet-3-5-20240620-v1:0';
process.env.BEDROCK_CLAUDE_HAIKU = 'anthropic.claude-3-haiku-20240307-v1:0';
process.env.BEDROCK_EMBED_MODEL = 'amazon.titan-embed-text-v2:0';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'readd_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
