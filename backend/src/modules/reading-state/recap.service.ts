/**
 * 리캡 재사용 판정 · 생성 · 캐시 적재 · 호출 로그 (R2, S5)
 *
 * @see dev-spec-R2-core.md S5
 * @see architecture-r1.md 5.2절 흐름 B, 4.4.1절(세션 종료 잡)
 *
 * 조항: FR-DAT-009 (저장 리캡 1건) · FR-DAT-010 (세션 캐시, 영구 저장 없음) · R7·R8
 *      · NFR-OBS-002 🚦 (리캡 호출 로그) · NFR-PERF-002 🚦 (스트리밍)
 *
 * ⚠️ LLM 호출은 `llmStream` 의존성을 통해서만 이뤄진다 — 실제 게이트웨이(⑥) 연결은
 *    라우트 계층(CP3 실데이터 전환 범위)에서 `import { stream } from '../llm-gateway/gateway'`를
 *    주입한다. 여기서 직접 import하지 않는 이유 — 게이트웨이 모듈(`gateway.ts`)은 import
 *    시점에 Bedrock 클라이언트를 만들고 모델 버전 환경변수를 검증한다(가드), 그 부작용을
 *    단위 테스트에 끌고 오지 않기 위해 함수 의존성으로 분리했다.
 *
 *    로그용 모델 ID는 예외다 — `model-config.ts`의 `getModelForTask`는 순수 함수이고
 *    (import 시점 부작용 없음, MODEL_CONFIG는 env 값을 읽는 객체 리터럴일 뿐) 위
 *    가드가 걸리는 `gateway.ts`와는 다른 모듈이라 직접 import해도 안전하다.
 */

import { assembleRecapInput } from './recap-assembly';
import type { RecapAssemblyDeps } from './recap-assembly';
import { getModelForTask } from '../llm-gateway/model-config';
import type {
  RecapCallLogger,
  SavedRecapRepository,
  SessionRecapCacheRepository,
} from './repository';
import type { RecapCallLog, RecapInput } from '../../shared/types';

export type RecapTrigger = 'realtime' | 'session_end';

export type RecapResult =
  | { kind: 'empty' }
  | { kind: 'reused'; text: string }
  | { kind: 'generated'; chunks: AsyncGenerator<string> };

/**
 * 스트리밍 종료 시 게이트웨이가 돌려주는 실사용량 (gateway.ts의 LLMStreamUsage와 필드명
 * 이 다르다 — R2는 게이트웨이 타입을 직접 import하지 않으므로 자체 이름을 쓴다).
 * `llmStream`이 반환값을 안 주면(테스트 페이크 등) undefined일 수 있다 — 그때는
 * `estimateTokens` 추정치로 흡수한다.
 */
export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface RecapServiceDeps extends RecapAssemblyDeps {
  savedRecap: SavedRecapRepository;
  sessionCache: SessionRecapCacheRepository;
  recapLog: RecapCallLogger;
  /**
   * LLM 게이트웨이 스트리밍 호출 (⑥ 경유는 이 함수를 주입하는 쪽의 책임).
   * 스트림이 끝날 때(`return`) 실제 토큰 사용량을 낼 수 있다 — `for await`는 그 반환값을
   * 버리므로 아래 `generateAndPersist`는 제너레이터를 수동으로 `.next()`해 받는다.
   * `options.maxTokens`는 분량 상한의 안전망이다(RECAP_MAX_TOKENS_SAFETY) — 실제 분량
   * 지시는 프롬프트가 담당하고, 이건 모델이 지시를 어겼을 때의 하드 캡일 뿐이다.
   */
  llmStream: (
    task: string,
    prompt: string,
    options?: { maxTokens?: number }
  ) => AsyncGenerator<string, LLMUsage | void>;
  /** 세션 캐시 만료 시각 계산용. 주입하지 않으면 24시간 뒤로 둔다(세션 종료 전 소멸 목적일 뿐 — TTL 자체는 스펙 미지정). */
  cacheTtlMs?: number;
}

export interface RecapService {
  /**
   * K에 대한 리캡을 반환한다. K=0이거나 재사용 가능하면 LLM을 부르지 않는다
   * (`empty` · `reused`). 그 외에는 스트리밍 생성 결과를 돌려준다(`generated`) —
   * 소비하는 즉시(청크를 전부 드레인하면) 캐시 적재와 로그 기록이 뒤따른다.
   *
   * `trigger = 'session_end'`는 재사용 판정을 타지 않고 항상 생성한다(R7, 진도 무관).
   * 생성분의 목적지도 다르다 — realtime은 세션 캐시(K), session_end는 저장 리캡 upsert.
   */
  getRecap(
    deviceId: string,
    bookId: string,
    cutoff: number,
    trigger: RecapTrigger
  ): Promise<RecapResult>;
}

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60_000;

/** 리캡 목표 분량 — 사용자 확정(2026-08-24): 500자 / 5문장 내외. 프롬프트 지시로 유도한다. */
const RECAP_TARGET_CHARS = 500;
const RECAP_TARGET_SENTENCES = 5;

/**
 * 목표 분량을 넘겨도 스트림이 끝없이 늘어나지 않게 하는 안전망. 한글은 토큰당 글자수가
 * 낮아(자모 단위 분절) 500자가 토큰 수로는 더 크게 잡힌다 — 목표 준수 시엔 걸리지 않고,
 * 모델이 지시를 무시했을 때만 강제로 끊는 하드 캡이다. 상한 강제(cutoff)와는 무관하다.
 */
const RECAP_MAX_TOKENS_SAFETY = 2048;

export function createRecapService(deps: RecapServiceDeps): RecapService {
  const { savedRecap, sessionCache, recapLog, llmStream, cacheTtlMs = DEFAULT_CACHE_TTL_MS } = deps;

  return {
    async getRecap(
      deviceId: string,
      bookId: string,
      cutoff: number,
      trigger: RecapTrigger
    ): Promise<RecapResult> {
      if (cutoff <= 0) {
        return { kind: 'empty' }; // ❓Q1 — 생성 대상 자체가 없다. 호출 0회
      }

      if (trigger === 'realtime') {
        const saved = await savedRecap.findSavedRecap(deviceId, bookId);
        if (saved !== null && saved.cutoff_page === cutoff) {
          return { kind: 'reused', text: saved.recap_text }; // R8 — 완전 일치만 재사용
        }

        const cached = await sessionCache.findCached(deviceId, bookId, cutoff);
        if (cached !== null) {
          return { kind: 'reused', text: cached }; // UC-09 A7
        }
      }
      // trigger === 'session_end'는 재사용 판정 자체를 건너뛴다 — 세션 종료 잡은 진도와
      // 무관하게 항상 재종합한다(R7, 10% 규칙 폐지·D1).

      const chunks = generateAndPersist(deps, deviceId, bookId, cutoff, trigger, {
        savedRecap,
        sessionCache,
        recapLog,
        llmStream,
        cacheTtlMs,
      });
      return { kind: 'generated', chunks };
    },
  };
}

async function* generateAndPersist(
  assemblyDeps: RecapAssemblyDeps,
  deviceId: string,
  bookId: string,
  cutoff: number,
  trigger: RecapTrigger,
  io: {
    savedRecap: SavedRecapRepository;
    sessionCache: SessionRecapCacheRepository;
    recapLog: RecapCallLogger;
    llmStream: (
      task: string,
      prompt: string,
      options?: { maxTokens?: number }
    ) => AsyncGenerator<string, LLMUsage | void>;
    cacheTtlMs: number;
  }
): AsyncGenerator<string> {
  const input = await assembleRecapInput(assemblyDeps, bookId, cutoff);
  const prompt = buildRecapPrompt(input);

  let fullText = '';
  const gen = io.llmStream('recap', prompt, { maxTokens: RECAP_MAX_TOKENS_SAFETY });
  let step = await gen.next();
  while (!step.done) {
    fullText += step.value;
    yield step.value;
    step = await gen.next();
  }
  const usage = step.value ?? undefined; // gen.next()의 마지막 호출 — TReturn 값 (for await로는 못 받는다)

  if (trigger === 'realtime') {
    await io.sessionCache.saveCached(
      deviceId,
      bookId,
      cutoff,
      fullText,
      new Date(Date.now() + io.cacheTtlMs)
    ); // FR-DAT-010 — 영구 저장 없음
  } else {
    await io.savedRecap.upsertSavedRecap(deviceId, bookId, cutoff, fullText); // FR-DAT-009
  }

  await io.recapLog.record(buildRecapCallLog(deviceId, bookId, input, fullText, trigger, usage)); // NFR-OBS-002 🚦
}

/**
 * 상한은 조립 단계(recap-assembly.ts)에서 이미 절단됐다. 이 프롬프트는 **종합 지시만**
 * 담당한다 — "기준점 이후를 쓰지 마"류 지시를 넣지 않는다(NFR-AI-004 🚦, 절대 규칙 3번).
 */
function buildRecapPrompt(input: RecapInput): string {
  const summaries = input.chapter_summaries
    .map((s) => `[${s.chapter_no}장 ${s.title}] ${s.content}`)
    .join('\n');
  const currentChapter = input.current_chapter_text ?? '';

  return [
    '아래 자료만으로 독자가 지금까지 읽은 줄거리를 이어서 요약해라.',
    `${RECAP_TARGET_SENTENCES}문장 내외, ${RECAP_TARGET_CHARS}자 이내로 간결하게 써라.`,
    '한 문단으로 몰아쓰지 말고 2~3개의 짧은 문단으로 나눠라. 문단 사이는 빈 줄로 구분해라.',
    '제목이나 "#" 같은 마크다운 기호를 붙이지 말고 본문 문단만 써라.',
    '완결된 장 요약:',
    summaries || '(없음)',
    '현재 장에서 읽은 부분:',
    currentChapter || '(없음)',
  ].join('\n\n');
}

function buildRecapCallLog(
  deviceId: string,
  bookId: string,
  input: RecapInput,
  outputText: string,
  trigger: RecapTrigger,
  usage: LLMUsage | undefined
): RecapCallLog {
  return {
    timestamp: new Date(),
    device_id: deviceId,
    book_id: bookId,
    cutoff_page: input.cutoff,
    input_chapter_summary_ids: input.chapter_summaries.map((s) => String(s.chapter_no)),
    current_chapter_cutoff: input.current_chapter_text !== null ? input.cutoff : null,
    output_ref: outputText,
    model: getModelForTask('recap'), // 실제 매핑된 모델 ID (R3 소유 설정, model-config.ts)
    tokens: usage
      ? { input: usage.inputTokens, output: usage.outputTokens } // 게이트웨이 실사용량 (커밋 410f558)
      : estimateTokens(input, outputText), // llmStream이 usage를 안 주는 경우(예: 테스트 페이크)의 대체
    trigger,
  };
}

/**
 * `llmStream` 의존성이 usage를 반환하지 않을 때만 쓰는 대체 추정치 — 실제 게이트웨이
 * (`gateway.ts`)는 커밋 410f558부터 스트림 종료 시 진짜 토큰 수를 반환한다.
 */
function estimateTokens(input: RecapInput, outputText: string): { input: number; output: number } {
  const inputChars =
    input.chapter_summaries.reduce((sum, s) => sum + s.content.length, 0) +
    (input.current_chapter_text?.length ?? 0);
  return {
    input: Math.ceil(inputChars / 2),
    output: Math.ceil(outputText.length / 2),
  };
}
