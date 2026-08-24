/**
 * S5 게이트 테스트 — 리캡 재사용 판정·LLM 호출 0/1회·로그 (recap.service)
 *
 * 근거: dev-spec-R2-core.md 4.5절 자가 검증 표 12~15번, 20~21번
 *
 * 테스트 규약 3.2절에 따라 구현 전에 작성했다. 조항 문구를 테스트 이름에 그대로 넣는다.
 */

import { createRecapService } from '../../../src/modules/reading-state/recap.service';
import {
  FakeRecapCallLogger,
  FakeSavedRecapRepository,
  FakeSessionRecapCacheRepository,
  SEED_BOOK_ID,
  SEED_DEVICE_ID,
  makeSeededFakes,
} from './fakes';

/** 호출 여부를 세는 페이크 LLM 스트리머 — "정" "주사" "는" 세 청크를 낸다. usage는 안 준다(estimate 경로 검증용). */
function makeFakeLlm() {
  let callCount = 0;
  const llmStream = async function* (_task: string, _prompt: string) {
    callCount++;
    yield '정';
    yield '주사';
    yield '는';
  };
  return { llmStream, callCount: () => callCount };
}

/** gateway.ts(커밋 410f558)처럼 스트림 종료 시 실제 usage를 반환하는 페이크. */
function makeFakeLlmWithUsage(usage: { inputTokens: number; outputTokens: number }) {
  const llmStream = async function* (_task: string, _prompt: string) {
    yield '정';
    yield '주사';
    return usage;
  };
  return { llmStream };
}

/** 실제로 게이트웨이에 어떤 프롬프트가 전달되는지 검사하기 위한 페이크. */
function makeFakeLlmCapturingPrompt() {
  const prompts: string[] = [];
  const llmStream = async function* (_task: string, prompt: string) {
    prompts.push(prompt);
    yield '정주사는';
  };
  return { llmStream, prompts };
}

function build() {
  const { books } = makeSeededFakes();
  const savedRecap = new FakeSavedRecapRepository();
  const sessionCache = new FakeSessionRecapCacheRepository();
  const recapLog = new FakeRecapCallLogger();
  const llm = makeFakeLlm();
  const service = createRecapService({
    content: books,
    books,
    savedRecap,
    sessionCache,
    recapLog,
    llmStream: llm.llmStream,
  });
  return { books, savedRecap, sessionCache, recapLog, llm, service };
}

async function drain(gen: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const chunk of gen) out += chunk;
  return out;
}

describe('리캡 재사용 판정 — getRecap', () => {
  test('❓Q1: K = 0 → 빈 상태 반환, LLM 호출 0회', async () => {
    const { service, llm } = build();

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 0, 'realtime');

    expect(result.kind).toBe('empty');
    expect(llm.callCount()).toBe(0);
  });

  test('FR-DAT-009·NFR-PERF-003: 저장 리캡.기준점 == K → 그대로 반환, 호출 0회', async () => {
    const { service, savedRecap, llm } = build();
    savedRecap.set(SEED_DEVICE_ID, SEED_BOOK_ID, { cutoff_page: 15, recap_text: '저장된 리캡' });

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');

    expect(result).toEqual({ kind: 'reused', text: '저장된 리캡' });
    expect(llm.callCount()).toBe(0);
  });

  test('R8: 저장 리캡.기준점 != K → 재사용하지 않는다 (새로 생성)', async () => {
    const { service, savedRecap, llm } = build();
    savedRecap.set(SEED_DEVICE_ID, SEED_BOOK_ID, { cutoff_page: 5, recap_text: '옛 리캡' });

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');

    expect(result.kind).toBe('generated');
    if (result.kind === 'generated') {
      await drain(result.chunks);
    }
    expect(llm.callCount()).toBe(1);
  });

  test('이슈 대응(분량 편차): 프롬프트가 자료 양과 무관한 분량 지시를 담는다', async () => {
    const { books, savedRecap, sessionCache, recapLog } = build();
    const captured = makeFakeLlmCapturingPrompt();
    const service = createRecapService({
      content: books,
      books,
      savedRecap,
      sessionCache,
      recapLog,
      llmStream: captured.llmStream,
    });

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');
    if (result.kind === 'generated') await drain(result.chunks);

    expect(captured.prompts).toHaveLength(1);
    expect(captured.prompts[0]).toMatch(/문장/);
    // NFR-AI-004 🚦 회귀 방지 — 분량 지시를 추가해도 "기준점 이후를 쓰지 마"류 상한
    // 지시는 절대 들어가면 안 된다. 상한은 조립 단계(입력 절단)에서만 강제한다.
    expect(captured.prompts[0]).not.toMatch(/기준점|cutoff|이후.*(쓰지|말)/i);
  });

  test('UC-09 A7: 세션 캐시(K) 적중 → 그대로 반환, 호출 0회', async () => {
    const { service, sessionCache, llm } = build();
    await sessionCache.saveCached(SEED_DEVICE_ID, SEED_BOOK_ID, 15, '캐시된 리캡', new Date());

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');

    expect(result).toEqual({ kind: 'reused', text: '캐시된 리캡' });
    expect(llm.callCount()).toBe(0);
  });

  test('재사용 미스 → LLM 1회 호출, 스트리밍 청크가 이어붙으면 원문과 같다', async () => {
    const { service, llm } = build();

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');

    expect(result.kind).toBe('generated');
    if (result.kind === 'generated') {
      const text = await drain(result.chunks);
      expect(text).toBe('정주사는');
    }
    expect(llm.callCount()).toBe(1);
  });

  test('실시간 생성분은 세션 캐시(K)에 적재된다 (영구 저장 없음, FR-DAT-010)', async () => {
    const { service, sessionCache } = build();

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');
    if (result.kind === 'generated') await drain(result.chunks);

    const cached = await sessionCache.findCached(SEED_DEVICE_ID, SEED_BOOK_ID, 15);
    expect(cached).toBe('정주사는');
  });

  test('R7: 세션 종료(session_end) 트리거는 재사용 판정 없이 항상 생성하고 저장 리캡에 적재한다', async () => {
    const { service, savedRecap, llm } = build();
    savedRecap.set(SEED_DEVICE_ID, SEED_BOOK_ID, { cutoff_page: 15, recap_text: '이미 있음' });

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'session_end');
    expect(result.kind).toBe('generated');
    if (result.kind === 'generated') await drain(result.chunks);

    expect(llm.callCount()).toBe(1); // 재사용 판정을 타지 않고 그대로 생성
    const saved = await savedRecap.findSavedRecap(SEED_DEVICE_ID, SEED_BOOK_ID);
    expect(saved).toEqual({ cutoff_page: 15, recap_text: '정주사는' });
  });
});

describe('리캡 호출 로그 — NFR-OBS-002 🚦', () => {
  test('리캡 호출 1회 → 로그 레코드 정확히 1건', async () => {
    const { service, recapLog } = build();

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');
    if (result.kind === 'generated') await drain(result.chunks);

    expect(recapLog.records).toHaveLength(1);
  });

  test('재사용 경로(K=0·저장분 일치·세션 캐시)는 호출이 아니므로 로그를 남기지 않는다', async () => {
    const { service, savedRecap, sessionCache, recapLog } = build();

    await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 0, 'realtime');

    savedRecap.set(SEED_DEVICE_ID, SEED_BOOK_ID, { cutoff_page: 15, recap_text: '저장' });
    await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');

    await sessionCache.saveCached(SEED_DEVICE_ID, SEED_BOOK_ID, 20, '캐시', new Date());
    await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 20, 'realtime');

    expect(recapLog.records).toHaveLength(0);
  });

  test('로그에 K·투입 요약 ID 목록·절단 페이지·트리거가 전부 들어 있다', async () => {
    const { service, recapLog } = build();

    // K=15 → 2장 중간, 완결 장은 1장뿐(요약 ID = ["1"]), 원문 절단은 K(15) 자체
    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');
    if (result.kind === 'generated') await drain(result.chunks);

    expect(recapLog.records).toHaveLength(1);
    const [entry] = recapLog.records;
    expect(entry.device_id).toBe(SEED_DEVICE_ID);
    expect(entry.book_id).toBe(SEED_BOOK_ID);
    expect(entry.cutoff_page).toBe(15);
    expect(entry.input_chapter_summary_ids).toEqual(['1']);
    expect(entry.current_chapter_cutoff).toBe(15);
    expect(entry.trigger).toBe('realtime');
    expect(typeof entry.output_ref).toBe('string');
    expect(entry.output_ref.length).toBeGreaterThan(0);
    // model은 태스크명 placeholder가 아니라 model-config.ts가 매핑한 실제 모델 ID다
    expect(entry.model).toBe(process.env.BEDROCK_CLAUDE_HAIKU);
    expect(entry.model).not.toBe('recap');
  });

  test('NFR-OBS-004: llmStream이 실사용량을 반환하면 추정치 대신 그 값을 로그에 쓴다', async () => {
    const { books } = makeSeededFakes();
    const savedRecap = new FakeSavedRecapRepository();
    const sessionCache = new FakeSessionRecapCacheRepository();
    const recapLog = new FakeRecapCallLogger();
    const { llmStream } = makeFakeLlmWithUsage({ inputTokens: 1234, outputTokens: 56 });
    const service = createRecapService({
      content: books,
      books,
      savedRecap,
      sessionCache,
      recapLog,
      llmStream,
    });

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');
    if (result.kind === 'generated') await drain(result.chunks);

    const [entry] = recapLog.records;
    expect(entry.tokens).toEqual({ input: 1234, output: 56 });
  });

  test('llmStream이 usage를 반환하지 않으면(테스트 페이크 등) 문자 수 추정치로 대체한다', async () => {
    const { service, recapLog } = build();

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 15, 'realtime');
    if (result.kind === 'generated') await drain(result.chunks);

    const [entry] = recapLog.records;
    expect(entry.tokens.input).toBeGreaterThan(0);
    expect(entry.tokens.output).toBeGreaterThan(0);
    expect(entry.tokens).not.toEqual({ input: 1234, output: 56 }); // 추정치는 실사용량과 우연히 같을 수 없는 값
  });

  test('K가 장 종료 페이지와 일치(원문 미투입)하면 로그의 절단 페이지가 null', async () => {
    const { service, recapLog } = build();

    const result = await service.getRecap(SEED_DEVICE_ID, SEED_BOOK_ID, 10, 'realtime');
    if (result.kind === 'generated') await drain(result.chunks);

    const [entry] = recapLog.records;
    expect(entry.current_chapter_cutoff).toBeNull();
  });
});
