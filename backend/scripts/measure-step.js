/**
 * 비용 계측 실행 래퍼 (NFR-OBS-004) — 파이프라인 단계 하나를 실행하며 사용량을 모은다.
 *
 * 사용: node scripts/measure-step.js --book <bookId> --step <이름> -- <실행할 명령...>
 *   예: node scripts/measure-step.js --book hwabun --step split -- \
 *         npx ts-node --transpile-only src/batch/pipeline/run-split.ts data/raw/hwabun.txt hwabun
 *
 * 남기는 것 (저장소 루트의 measurements/<bookId>/):
 *   <step>.log          stdout·stderr 원문 (화면에도 그대로 보인다)
 *   <step>.jsonl        [LLM Metrics]·[Embed Metrics] 줄을 파싱한 레코드 (kind 필드로 구분)
 *   <step>.summary.json 시작·종료 시각, 벽시계 ms, 종료 코드, task별·inputType별 토큰 합
 *
 * 명령은 그대로 실행만 한다 — API를 직접 부르지 않는다. 같은 단계를 다시 재면 세 파일을
 * 덮어쓰므로, 재시도를 따로 남기려면 --step 이름을 바꾼다(예: generate-full.retry1).
 */
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const fs = require('fs');
const path = require('path');

const MEASUREMENTS_DIR = path.join(__dirname, '../../measurements');
const METRIC_TAGS = { '[LLM Metrics]': 'llm', '[Embed Metrics]': 'embed' };
// retry.ts 의 재시도 대기 로그 — 실패로 날아간 시간도 비용이라 따로 센다
const RETRY_PATTERN = /Retrying after (\d+)ms/;

function parseArgs(argv) {
  const sep = argv.indexOf('--');
  const own = sep === -1 ? argv : argv.slice(0, sep);
  const command = sep === -1 ? [] : argv.slice(sep + 1);
  const value = (flag) => {
    const i = own.indexOf(flag);
    return i === -1 ? undefined : own[i + 1];
  };
  const book = value('--book');
  const step = value('--step');
  if (!book || !step || command.length === 0) {
    throw new Error('사용: node scripts/measure-step.js --book <bookId> --step <이름> -- <명령...>');
  }
  // 파일 경로로 쓰이므로 디렉터리 이탈을 막는다
  for (const [name, v] of [['--book', book], ['--step', step]]) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v)) throw new Error(`${name} 형식이 잘못됨: ${v}`);
  }
  return { book, step, command };
}

/** 한 줄에서 메트릭 레코드를 뽑는다. 메트릭 줄이 아니거나 JSON이 깨졌으면 null */
function parseMetricLine(line) {
  for (const [tag, kind] of Object.entries(METRIC_TAGS)) {
    const at = line.indexOf(tag);
    if (at === -1) continue;
    try {
      return { kind, ...JSON.parse(line.slice(at + tag.length).trim()) };
    } catch {
      return null;
    }
  }
  return null;
}

function emptyUsage() {
  return { calls: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, durationMs: 0 };
}

/** jsonl 레코드와 재시도 대기 목록으로 summary의 사용량 부분을 만든다 */
function summarize(records, retryWaits = []) {
  const llm = { calls: 0, byTask: {}, total: emptyUsage() };
  const embed = { calls: 0, byInputType: {}, total: { calls: 0, count: 0, billedInputTokens: 0, durationMs: 0, waitMs: 0 } };
  let unparsed = 0;

  for (const r of records) {
    if (r.kind === 'llm') {
      llm.calls++;
      const task = r.task || 'unknown';
      const bucket = (llm.byTask[task] = llm.byTask[task] || emptyUsage());
      for (const target of [bucket, llm.total]) {
        target.calls++;
        target.inputTokens += r.inputTokens || 0;
        // 게이트웨이 필드명은 cachedInputTokens다
        target.cachedTokens += r.cachedInputTokens || r.cachedTokens || 0;
        target.outputTokens += r.outputTokens || 0;
        target.reasoningTokens += r.reasoningTokens || 0;
        target.durationMs += r.durationMs || 0;
      }
    } else if (r.kind === 'embed') {
      embed.calls++;
      const type = r.inputType || 'unknown';
      const bucket = (embed.byInputType[type] = embed.byInputType[type] || {
        calls: 0, count: 0, billedInputTokens: 0, durationMs: 0, waitMs: 0, missingBilledUnits: 0,
      });
      for (const target of [bucket, embed.total]) {
        target.calls++;
        target.count += r.count || 0;
        target.billedInputTokens += r.billedInputTokens || 0;
        target.durationMs += r.durationMs || 0;
        target.waitMs += r.waitMs || 0;
      }
      if (r.billedInputTokens == null) bucket.missingBilledUnits++;
    } else {
      unparsed++;
    }
  }
  return {
    llm,
    embed,
    retries: { count: retryWaits.length, waitMs: retryWaits.reduce((a, b) => a + b, 0) },
    unparsedMetricLines: unparsed,
  };
}

/**
 * Windows에서 npx 같은 .cmd를 찾으려면 셸이 필요하다. 셸은 인자를 그냥 이어 붙이므로
 * 실행 파일 경로(C:\Program Files\...)를 포함해 공백 있는 조각을 따옴표로 감싼 한 줄로 넘긴다.
 */
function spawnCommand(command) {
  const options = { stdio: ['inherit', 'pipe', 'pipe'], env: process.env };
  if (process.platform !== 'win32') return spawn(command[0], command.slice(1), options);
  const line = command.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
  return spawn(line, { ...options, shell: true });
}

function run({ book, step, command }, measurementsDir = MEASUREMENTS_DIR) {
  const outDir = path.join(measurementsDir, book);
  fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, `${step}.log`);
  const jsonlPath = path.join(outDir, `${step}.jsonl`);
  const summaryPath = path.join(outDir, `${step}.summary.json`);
  const log = fs.createWriteStream(logPath);
  const jsonl = fs.createWriteStream(jsonlPath);

  const records = [];
  const retryWaits = [];
  const startedAt = new Date();
  const child = spawnCommand(command);

  // 스트림마다 줄 단위로 끊어 읽는다 — 청크 경계에서 메트릭 줄이 잘리지 않게
  for (const [stream, sink] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    // 청크 경계에서 한글(멀티바이트)이 잘려도 깨지지 않게 디코더를 쓴다
    const decoder = new StringDecoder('utf8');
    let pending = '';
    const handleLine = (line) => {
      const record = parseMetricLine(line);
      if (record) {
        records.push(record);
        jsonl.write(JSON.stringify(record) + '\n');
      } else if (line.includes('[LLM Metrics]') || line.includes('[Embed Metrics]')) {
        records.push({ kind: 'unparsed', line });
      }
      const retry = RETRY_PATTERN.exec(line);
      if (retry) retryWaits.push(Number(retry[1]));
    };
    stream.on('data', (chunk) => {
      sink.write(chunk);
      log.write(chunk);
      pending += decoder.write(chunk);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      lines.forEach(handleLine);
    });
    stream.on('end', () => {
      pending += decoder.end();
      if (pending) handleLine(pending);
    });
  }

  // process.exit 전에 log·jsonl 버퍼가 디스크에 다 써져야 한다
  const finished = (stream) => new Promise((r) => stream.end(r));

  return new Promise((resolve) => {
    child.on('close', async (code, signal) => {
      const endedAt = new Date();
      const summary = {
        bookId: book,
        step,
        command: command.join(' '),
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        wallMs: endedAt.getTime() - startedAt.getTime(),
        exitCode: code,
        signal: signal || null,
        ...summarize(records, retryWaits),
      };
      await Promise.all([finished(log), finished(jsonl)]);
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf-8');
      console.error(`[measure-step] ${summaryPath} (exit ${code}, ${summary.wallMs}ms)`);
      resolve(summary);
    });
  });
}

if (require.main === module) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  run(args).then((summary) => process.exit(summary.exitCode === null ? 1 : summary.exitCode));
}

module.exports = { parseArgs, parseMetricLine, summarize, run, MEASUREMENTS_DIR };
