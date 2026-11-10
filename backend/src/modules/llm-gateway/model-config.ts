import dotenv from 'dotenv';

// NFR-AI-001: load local configuration before capturing provider/model defaults.
dotenv.config();

type LLMProvider = 'openai' | 'anthropic';

function selectedProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER?.trim() || 'openai';
  if (provider !== 'openai' && provider !== 'anthropic') {
    throw new Error('Invalid LLM_PROVIDER: expected openai or anthropic');
  }
  return provider;
}

/** Provider changes are explicit; authentication failure never switches vendors. */
export const LLM_PROVIDER = selectedProvider();

const DEFAULT_MODEL =
  LLM_PROVIDER === 'openai'
    ? process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna'
    : process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5';

export const DEFAULT_EFFORT =
  LLM_PROVIDER === 'openai'
    ? process.env.OPENAI_REASONING_EFFORT?.trim() || 'low'
    : (process.env.ANTHROPIC_EFFORT?.trim() ?? '');

const VALID_OPENAI_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

if (LLM_PROVIDER === 'openai' && !VALID_OPENAI_EFFORTS.includes(DEFAULT_EFFORT)) {
  throw new Error(
    'Invalid OPENAI_REASONING_EFFORT: expected none, low, medium, high, xhigh or max'
  );
}

export const EFFORT_ENABLED = DEFAULT_EFFORT !== '';

/** NFR-AI-001: all existing task names retain a single configurable model. */
export const MODEL_CONFIG = {
  chatbot: DEFAULT_MODEL,
  recap: DEFAULT_MODEL,
  generate_summary: DEFAULT_MODEL,
  generate_character: DEFAULT_MODEL,
  generate_relationship: DEFAULT_MODEL,
  generate_background: DEFAULT_MODEL,
  generate_term: DEFAULT_MODEL,
  generate_event: DEFAULT_MODEL,
} as const;

export function getModelForTask(task: string): string {
  const model = MODEL_CONFIG[task as keyof typeof MODEL_CONFIG];
  if (!model) {
    console.warn(`Unknown task: ${task}, falling back to default model`);
    return DEFAULT_MODEL;
  }
  return model;
}

/** NFR-AI-002: log the configured provider/model and validate only its credentials. */
export function validateModelVersions(): void {
  if (process.env.MOCK_MODE === 'true') {
    console.log('Mock Mode: Skipping model credential validation');
    return;
  }

  const keyName = LLM_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  if (!process.env[keyName]?.trim()) {
    throw new Error(`Missing required environment variable: ${keyName}`);
  }

  console.log('[LLM Gateway] 기본 모델', {
    provider: LLM_PROVIDER,
    model: DEFAULT_MODEL,
    effort: DEFAULT_EFFORT || '(사용 안 함)',
    fallback: '(없음 — 선택한 제공자 내 재시도만)',
  });
}
