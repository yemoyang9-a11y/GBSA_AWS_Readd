/**
 * AWS SDK 클라이언트 설정
 *
 * Bedrock, S3 등
 */

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

/**
 * AWS 리전
 */
export const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

/**
 * Bedrock Runtime 클라이언트
 *
 * LLM 게이트웨이에서 사용
 */
export const bedrockClient = new BedrockRuntimeClient({
  region: AWS_REGION,
});

/**
 * 환경 변수 검증
 */
export function validateAwsConfig(): void {
  const required = [
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'BEDROCK_CLAUDE_SONNET',
    'BEDROCK_CLAUDE_HAIKU',
    'BEDROCK_EMBED_MODEL',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('[AWS Config] Missing required environment variables:', missing);
    throw new Error(`Missing AWS config: ${missing.join(', ')}`);
  }

  console.log('[AWS Config] Validated', {
    region: AWS_REGION,
    sonnet: process.env.BEDROCK_CLAUDE_SONNET?.substring(0, 30) + '...',
    haiku: process.env.BEDROCK_CLAUDE_HAIKU?.substring(0, 30) + '...',
  });
}
