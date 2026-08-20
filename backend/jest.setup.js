// Jest 환경 설정
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.BEDROCK_CLAUDE_SONNET = 'anthropic.claude-sonnet-3-5-20240620-v1:0';
process.env.BEDROCK_CLAUDE_HAIKU = 'anthropic.claude-3-haiku-20240307-v1:0';
process.env.BEDROCK_EMBED_MODEL = 'amazon.titan-embed-text-v2:0';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'readd_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
