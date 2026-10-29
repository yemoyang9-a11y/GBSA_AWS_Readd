/**
 * NFR-OBS-004: 비용 계측 래퍼(scripts/measure-step.js) — 가짜 [LLM Metrics]/[Embed Metrics]
 * 줄을 출력하는 자식 프로세스로 log·jsonl·summary 산출을 확인한다. API 호출 없음.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const measureStep = require('../../../scripts/measure-step.js');

const llmLine = (task: string, extra: Record<string, unknown>) =>
  `[LLM Metrics] ${JSON.stringify({ timestamp: 't', provider: 'openai', task, modelId: 'm', durationMs: 100, ...extra })}`;
const embedLine = (inputType: string, billed: number | null) =>
  `[Embed Metrics] ${JSON.stringify({ timestamp: 't', model: 'embed-v4.0', inputType, count: 64, billedInputTokens: billed, durationMs: 50, waitMs: 7 })}`;

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-step-'));
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('NFR-OBS-004: 메트릭 줄을 jsonl로, task·inputType별 합을 summary로 남기고 종료 코드를 그대로 기록한다', async () => {
  const lines = [
    '=== 한글 진행 로그 ===',
    llmLine('generate_summary', { inputTokens: 1000, cachedInputTokens: 200, outputTokens: 300, reasoningTokens: 120 }),
    llmLine('generate_summary', { inputTokens: 500, outputTokens: 100 }),
    llmLine('generate_event', { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 }),
    embedLine('search_document', 70000),
    'Retrying after 1500ms (attempt 1/3) { task: "embed" }',
    '[LLM Metrics] {깨진 json',
  ];
  const fixture = path.join(dir, 'fixture.js');
  fs.writeFileSync(
    fixture,
    `const lines = ${JSON.stringify(lines)};\n` +
      `for (const l of lines) console.log(l);\n` +
      `console.error(${JSON.stringify(embedLine('search_query', 12))});\n` +
      `process.exitCode = 3;\n`
  );

  const summary = await measureStep.run(
    { book: 'fixture-book', step: 'gen', command: [process.execPath, fixture] },
    dir
  );
  const out = path.join(dir, 'fixture-book');

  expect(summary.exitCode).toBe(3);
  expect(Number.isNaN(Date.parse(summary.startedAt))).toBe(false);
  expect(summary.wallMs).toBeGreaterThanOrEqual(0);

  const jsonl = fs
    .readFileSync(path.join(out, 'gen.jsonl'), 'utf-8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  expect(jsonl.map((r) => r.kind).sort()).toEqual(['embed', 'embed', 'llm', 'llm', 'llm']);

  expect(summary.llm.calls).toBe(3);
  expect(summary.llm.byTask.generate_summary).toMatchObject({
    calls: 2,
    inputTokens: 1500,
    cachedTokens: 200,
    outputTokens: 400,
    reasoningTokens: 120,
  });
  expect(summary.llm.byTask.generate_event).toMatchObject({ calls: 1, inputTokens: 10 });
  expect(summary.llm.total.inputTokens).toBe(1510);
  expect(summary.embed.byInputType.search_document).toMatchObject({ calls: 1, count: 64, billedInputTokens: 70000, waitMs: 7 });
  expect(summary.embed.byInputType.search_query).toMatchObject({ calls: 1, billedInputTokens: 12 });
  expect(summary.retries).toEqual({ count: 1, waitMs: 1500 });
  expect(summary.unparsedMetricLines).toBe(1);

  expect(fs.readFileSync(path.join(out, 'gen.log'), 'utf-8')).toContain('=== 한글 진행 로그 ===');
  expect(JSON.parse(fs.readFileSync(path.join(out, 'gen.summary.json'), 'utf-8'))).toEqual(summary);
});

test('NFR-OBS-004: 인자 검증 — 명령 없음·경로 이탈 이름은 거부한다', () => {
  expect(() => measureStep.parseArgs(['--book', 'hwabun', '--step', 'x'])).toThrow(/사용/);
  expect(() => measureStep.parseArgs(['--book', '../x', '--step', 's', '--', 'node'])).toThrow(/형식/);
  expect(measureStep.parseArgs(['--book', 'hwabun', '--step', 'split', '--', 'npx', 'ts-node', 'a.ts'])).toEqual({
    book: 'hwabun',
    step: 'split',
    command: ['npx', 'ts-node', 'a.ts'],
  });
});

test('NFR-OBS-004: 메트릭 줄은 접두어 앞에 다른 글자가 있어도 파싱하고, 아닌 줄은 null', () => {
  expect(measureStep.parseMetricLine(`2026-10-26 ${embedLine('search_query', 3)}`)).toMatchObject({
    kind: 'embed',
    billedInputTokens: 3,
  });
  expect(measureStep.parseMetricLine('그냥 로그')).toBeNull();
});
