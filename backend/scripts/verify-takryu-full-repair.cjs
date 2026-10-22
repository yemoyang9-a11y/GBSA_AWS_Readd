'use strict';

// Operational acceptance, deliberately independent of the repair manifest.
// No dotenv, database driver, API key, reviewer model, retries, or data deletion.
// --verify uses only a newly generated device's normal public API state.
// --chat additionally permits at most six model requests; answers need human review.
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const BOOK = 'takryu';
const PREFIX = `/books/${BOOK}`;
const TIMEOUT_MS = 90_000;
const ID = {
  cho: '05439e81-649a-4035-9b56-f9ddfa12767c', gye: 'a80139e1-6bd7-4adc-b8c7-8d8a9d472683',
  jung: '9d5db924-2429-453a-bff4-e2b72644821a', jae: '7a538c2d-6c08-468a-a1a9-549cb5586c29',
  seung: '5a530e97-a2fa-4838-9d18-fa7d945dcf85', hyeong: '08046f69-0ee4-45be-aeda-0575add04131',
  haeng: 'cf11d654-f9ca-4da6-b012-36a14f22dae1', myeong: '53a551c1-2524-4dd7-8290-86d434934255',
  gom: 'd48ea117-3db2-4bb4-a5ec-74fa4c23c139', pole: '4ddbf9b5-2af3-4181-9ab7-ac7438749f97',
  baek: '6b4ead63-5cbd-4b32-9dbc-bb8e1bd41762', jeon: '538f69a7-2212-468b-b074-efd7545fad41',
  chief: '08ae4c7b-a059-411a-a3b9-4d86c88d899c', regi: '41bcffac-46b5-4371-b963-4b52da82203b',
  short: 'e47fd016-c3f6-4f3c-9a79-6835e90ff324', okkom: 'f0fd255d-788c-4c94-8c27-0a7d810b905d',
  acne: '65380053-b943-434d-b396-0ed0d7c1560c', maid: 'a2073b7a-d935-4ee5-95f0-907873c63b95',
};
// Anchors were independently read in the frozen raw source, not inferred from
// operation.after. The graph is also the application's character list route.
const BOUNDARIES = [
  { id: ID.haeng, name: '행화', page: 20, anchor: '길 건너편 샛골목에서 행화가 나오더니' },
  { id: ID.baek, name: '백석', page: 64, anchor: '진출인은 백석 이라고 하는 고리대금업자' },
  { id: ID.maid, name: '식모', page: 232, anchor: '식모도 이렇게 미리 구해 놓았고' },
  { id: ID.pole, name: '전봇대', page: 303, anchor: '고개 를 한참 쳐들어야 얼굴이 보이는' },
  { id: ID.jeon, name: '전서방', page: 325, anchor: '전서방이라고 살기는' },
  { id: ID.chief, name: '주임', page: 353, anchor: '주임이라는 제 권위를' },
  { id: ID.regi, name: '레지', page: 353, anchor: '레지가 찰그랑거리고 앉았고' },
  { id: ID.short, name: '단발쟁이', page: 353, anchor: '싱글로 깎아올린 단발쟁이가 있고' },
  { id: ID.okkom, name: '오꼼이', page: 353, anchor: '눈도 오꼼 입도 오꼼한 오꼼이가 있고' },
  { id: ID.acne, name: '여드름바가지', page: 354, anchor: '여드름바가지가 있구' },
];
const FORBIDDEN_RELATIONS = [
  { page: 20, a: ID.cho, b: ID.gye, label: '언니와 남동생', row: 'R016', evidence: 'p6: 초봉은 맏딸, 계봉은 작은딸' },
  { page: 40, a: ID.jae, b: ID.jung, label: '혼담관계', row: 'R023', evidence: 'p17: 혼담 당사자 연결은 김씨의 이야기' },
  { page: 44, a: ID.seung, b: ID.jae, label: '고용주', row: 'R039', evidence: 'p50: 승재의 고용주는 금호의원 윤달식' },
  { page: 70, a: ID.hyeong, b: ID.haeng, label: '연인', row: 'R049', evidence: 'p70-78: 행화와 태수의 관계, 형보는 별개의 기생을 둠' },
  { page: 92, a: ID.myeong, b: ID.gom, label: '모자', row: 'R058', evidence: 'p92: 두 집을 따로 언급, p97: 명님은 양서방의 딸' },
  { page: 102, a: ID.seung, b: ID.gye, label: '누이동생-형', row: 'R065', evidence: 'p6 가족 목록 및 p102 대화는 혈연 증거가 아님' },
];
const FORBIDDEN_ALIASES = [
  { id: ID.jung, alias: '정주산', row: 'A002' },
  { id: ID.jae, alias: '선영', row: 'A033' },
  { id: ID.chief, alias: '검인의 스탬프를 손에 쥐고 있는 사내', row: 'A081' },
  { id: ID.okkom, alias: '오꼼이가', row: 'A083' },
  { id: ID.pole, alias: '키가 대중없이 길다', row: 'prior-repair' },
];
const POLE_NOTE = "정주사와 같은 하바꾼으로, 키가 매우 길어서 '전봇대'라는 별명이 생겼다.";
const QUESTIONS = [
  { page: 20, query: '행화는 이 페이지에서 어떤 인물이야? 지금까지 나온 내용만 알려줘.', rubric: '행화가 가게로 들어와 초봉과 편하게 인사함. p21에서 명시되는 기생 신분을 확정해 앞당기지 않음.' },
  { page: 70, query: '장형보와 행화는 연인 사이야?', rubric: '잘못된 장형보-행화 연인 관계를 긍정하지 않음. 현재 범위에 근거한 행화-태수 연결과 구분.' },
  { page: 92, query: '명님이와 먹곰보는 모자 관계야?', rubric: '두 집의 언급을 모자 관계로 오인하지 않음. p97에 처음 명시되는 양서방 부녀 관계를 앞당기지 않음.' },
  { page: 232, query: '초봉이가 새집에 들어왔을 때 맞아 준 여자는 누구야?', rubric: '미리 구해 둔 식모이며 미래의 사건이나 다른 어멈과의 동일인 단정 없음.' },
  { page: 303, query: '키가 대중없이 길다도 전봇대의 별명이야?', rubric: '잘못된 문구를 별명으로 승인하지 않음. 얼굴을 보려 고개를 들어야 하는 간접 키 묘사는 인정하며 p304의 명시적 별명 유래와 구분.' },
  { page: 304, query: '전봇대라는 별명이 왜 붙었고, 정주사와는 어떤 관계야?', rubric: '키가 대중없이 길어서 붙은 별명이며 정주사와 같은 하바꾼. 알려지지 않은 본명이나 가족 관계를 지어내지 않음.' },
];

function fail(code) { throw Object.assign(new Error(code), { code }); }
function assert(condition, code) { if (!condition) fail(code); }
function pairMatches(edge, a, b) {
  return (edge.source === a && edge.target === b) || (edge.source === b && edge.target === a);
}
function checkGraph(graph, page) {
  assert(Array.isArray(graph?.nodes) && Array.isArray(graph.edges), 'GRAPH_SHAPE');
  const ids = new Set(graph.nodes.map(node => node.id));
  assert(ids.size === graph.nodes.length, 'GRAPH_DUPLICATE_NODE');
  for (const node of graph.nodes) {
    assert(Number.isInteger(node.first_appearance_page) && node.first_appearance_page <= page, 'GRAPH_FUTURE_CHARACTER');
    assert(Array.isArray(node.aliases) && node.aliases.every(alias => typeof alias === 'string'), 'GRAPH_ALIAS_SHAPE');
  }
  for (const edge of graph.edges) {
    assert(ids.has(edge.source) && ids.has(edge.target), 'GRAPH_DANGLING_EDGE');
    assert(Number.isInteger(edge.established_page) && edge.established_page <= page, 'GRAPH_FUTURE_RELATIONSHIP');
  }
  for (const target of BOUNDARIES) {
    const node = graph.nodes.find(item => item.id === target.id);
    assert(Boolean(node) === (page >= target.page), `CHARACTER_BOUNDARY_${target.page}`);
    if (node) assert(node.name === target.name && node.first_appearance_page === target.page, `CHARACTER_METADATA_${target.page}`);
  }
  for (const target of FORBIDDEN_RELATIONS.filter(item => item.page <= page)) {
    assert(!graph.edges.some(edge => pairMatches(edge, target.a, target.b) && edge.label === target.label), `BAD_RELATION_${target.row}`);
  }
  for (const target of FORBIDDEN_ALIASES) {
    assert(!graph.nodes.find(node => node.id === target.id)?.aliases.includes(target.alias), `BAD_ALIAS_${target.row}`);
  }
  if (page === 46 || page === 47) {
    assert(graph.nodes.find(node => node.id === ID.cho)?.aliases.includes('형') === (page === 47), 'CHO_KINSHIP_ALIAS_47');
  }
  if (page === 303 || page === 304) {
    const edges = graph.edges.filter(edge => pairMatches(edge, ID.pole, ID.jung) && edge.label === '동료 하바꾼');
    assert(edges.length === (page === 304 ? 1 : 0) && edges.every(edge => edge.established_page === 304), 'PRIOR_RELATION_304');
  }
}
function checkDetail(detail, target, page) {
  if (page < target.page) {
    assert(detail?.error === 'NOT_FOUND' && !detail.name && !detail.notes && !detail.aliases, 'FUTURE_DETAIL_EXPOSED');
    return;
  }
  assert(detail?.name === target.name && detail.first_appearance_page === target.page, 'DETAIL_METADATA');
  assert(typeof detail.notes === 'string' && Array.isArray(detail.aliases), 'DETAIL_SHAPE');
  assert(detail.aliases.every(alias => alias.character_id === target.id && Number.isInteger(alias.first_appearance_page) && alias.first_appearance_page <= page), 'DETAIL_FUTURE_ALIAS');
  for (const forbidden of FORBIDDEN_ALIASES.filter(item => item.id === target.id)) {
    assert(!detail.aliases.some(alias => alias.alias === forbidden.alias), `DETAIL_BAD_ALIAS_${forbidden.row}`);
  }
  if (target.id === ID.pole && (page === 303 || page === 304)) {
    assert(detail.notes.includes(POLE_NOTE) === (page === 304), 'PRIOR_NOTE_304');
  }
}
// Keep CRLF pairs intact even when the network splits between CR and LF.
function makeSseParser(onEvent) {
  let buffered = '';
  return {
    push(text) {
      buffered += text;
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffered))) {
        const frame = buffered.slice(0, match.index);
        buffered = buffered.slice(match.index + match[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (data) {
          let event;
          try { event = JSON.parse(data); } catch { fail('SSE_INVALID_JSON'); }
          onEvent(event);
        }
      }
    },
    finish() { assert(!buffered.trim(), 'SSE_INCOMPLETE_FRAME'); },
  };
}
function parseArgs(args) {
  const options = { verify: false, chat: false, selfTest: false, api: 'https://ssabi-api.fly.dev' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    assert(!seen.has(arg), 'DUPLICATE_ARGUMENT'); seen.add(arg);
    if (arg === '--verify') options.verify = true;
    else if (arg === '--chat') options.chat = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--api' || arg === '--output') {
      assert(args[i + 1] && !args[i + 1].startsWith('--'), 'MISSING_ARGUMENT');
      options[arg.slice(2)] = args[++i];
    } else fail('UNKNOWN_ARGUMENT');
  }
  assert(!options.chat || options.verify, 'CHAT_REQUIRES_VERIFY');
  assert(!options.selfTest || (!options.verify && !options.chat), 'SELF_TEST_CANNOT_VERIFY');
  let url;
  try { url = new URL(options.api); } catch { fail('INVALID_API_ORIGIN'); }
  assert(url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'API_MUST_BE_HTTPS_ORIGIN');
  options.api = url.origin;
  options.output = path.resolve(options.output || path.join(__dirname, '../../docs/reports', `takryu-full-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
  return options;
}
function selfTest() {
  const expectFailure = (fn, code) => {
    let actual;
    try { fn(); } catch (error) { actual = error.code; }
    assert(actual === code, `SELF_TEST_${code}`);
  };
  const fixture = page => ({ nodes: BOUNDARIES.filter(t => t.page <= page).map(t => ({ id: t.id, name: t.name, first_appearance_page: t.page, aliases: [] })), edges: [] });
  checkGraph(fixture(20), 20);
  const early = fixture(20); early.nodes[0].first_appearance_page = 21;
  expectFailure(() => checkGraph(early, 20), 'GRAPH_FUTURE_CHARACTER');
  expectFailure(() => checkGraph(fixture(19), 20), 'CHARACTER_BOUNDARY_20');
  const wrong = fixture(70); wrong.nodes.push({ id: ID.hyeong, name: '장형보', first_appearance_page: 4, aliases: [] });
  wrong.edges.push({ source: ID.hyeong, target: ID.haeng, label: '연인', established_page: 70 });
  expectFailure(() => checkGraph(wrong, 70), 'BAD_RELATION_R049');
  const alias = fixture(353); alias.nodes.find(n => n.id === ID.okkom).aliases.push('오꼼이가');
  expectFailure(() => checkGraph(alias, 353), 'BAD_ALIAS_A083');
  checkDetail({ error: 'NOT_FOUND' }, BOUNDARIES[0], 19);
  expectFailure(() => checkDetail({ error: 'NOT_FOUND', name: '행화' }, BOUNDARIES[0], 19), 'FUTURE_DETAIL_EXPOSED');
  expectFailure(() => parseArgs(['--chat']), 'CHAT_REQUIRES_VERIFY');
  expectFailure(() => parseArgs(['--api', 'https://user:password@example.test']), 'API_MUST_BE_HTTPS_ORIGIN');
  const events = []; const parser = makeSseParser(event => events.push(event));
  for (const ch of ': keepalive\r\n\r\ndata: {"type":"delta","text":"한글"}\r\n\r\ndata: {"type":"done"}\n\n') parser.push(ch);
  parser.finish();
  assert(events.length === 2 && events[0].text === '한글' && events[1].type === 'done', 'SELF_TEST_SPLIT_SSE');
  const partial = makeSseParser(() => {}); partial.push('data: {}');
  expectFailure(() => partial.finish(), 'SSE_INCOMPLETE_FRAME');
  return 11;
}

async function run(options) {
  const report = {
    schemaVersion: 1, startedAt: new Date().toISOString(), api: options.api, bookId: BOOK,
    status: 'planned', mode: options.selfTest ? 'self-test' : options.verify ? (options.chat ? 'api-and-chat' : 'api-only') : 'dry-run',
    credentialsLoaded: false, databaseConnections: 0, networkRequests: 0, chatRequests: 0,
    maximumChatRequests: options.chat ? QUESTIONS.length : 0, deviceId: null,
    coverage: { characterBoundaries: BOUNDARIES, forbiddenRelations: FORBIDDEN_RELATIONS, forbiddenAliases: FORBIDDEN_ALIASES,
      aliasBoundary: { characterId: ID.cho, alias: '형', before: 46, after: 47 }, priorRepairPages: [303, 304],
      fullDatabaseVerification: 'Separate manifest DB verification is required for all 169 operations and 44 held rows. Graph exposes only the latest relation per ordered pair; detail notes are truncated.' },
    plannedQuestions: options.chat ? QUESTIONS : [], checks: [], chats: [], semanticReview: options.chat ? 'pending-human-review' : 'not-requested',
  };
  const emit = event => process.stdout.write(JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
  let stage = 'planned'; let seq = 0; let conversationId;
  function passed(name, details = {}) { report.checks.push({ name, status: 'passed', ...details }); emit({ stage: name, status: 'passed', ...details }); }
  function requestOptions(body) {
    return { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'X-Device-Id': report.deviceId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body) };
  }
  async function request(route, body) {
    report.networkRequests++;
    return fetch(new URL(route, options.api), requestOptions(body));
  }
  async function json(route, body, expectedStatus = 200) {
    const response = await request(route, body);
    assert(response.status === expectedStatus, `HTTP_${response.status}_EXPECTED_${expectedStatus}`);
    const text = await response.text(); assert(text.length < 2_000_000, 'JSON_TOO_LARGE');
    try { return JSON.parse(text); } catch { fail('INVALID_JSON'); }
  }
  async function sse(route, body, onEvent) {
    const start = performance.now(); const response = await request(route, body);
    assert(response.status === 200, `SSE_HTTP_${response.status}`);
    assert(response.headers.get('content-type')?.includes('text/event-stream') && response.body, 'SSE_CONTENT_TYPE');
    const parser = makeSseParser(event => onEvent(event, Math.round(performance.now() - start)));
    const decoder = new TextDecoder(); let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength; assert(bytes < 1_000_000, 'SSE_TOO_LARGE');
      parser.push(decoder.decode(chunk, { stream: true }));
    }
    parser.push(decoder.decode()); parser.finish();
    return Math.round(performance.now() - start);
  }
  async function progress(page) {
    const result = await json(`${PREFIX}/progress`, { page, seq: ++seq });
    assert(result.success === true && result.applied_cutoff === page, 'PROGRESS_CUTOFF_MISMATCH');
  }
  try {
    // Refuse to overwrite an existing artifact before making any external request.
    assert(!fs.existsSync(options.output), 'OUTPUT_ALREADY_EXISTS');
    if (options.selfTest) { report.selfTests = selfTest(); report.status = 'self-test-passed'; return report; }
    if (!options.verify) { report.status = 'not-run'; return report; }
    report.deviceId = randomUUID(); report.status = 'running';
    emit({ stage: 'start', api: options.api, deviceId: report.deviceId, mode: report.mode, maximumChatRequests: report.maximumChatRequests });
    stage = 'health'; assert((await json('/health')).status === 'ok', 'HEALTH_NOT_OK'); passed(stage);
    stage = 'catalog'; const books = await json('/books');
    assert(books.books?.some(book => book.book_id === BOOK && book.ssabi_ready === true), 'TAKRYU_NOT_READY'); passed(stage);
    stage = 'diagnostic-sse'; const arrivals = []; let diagDone = false;
    const totalMs = await sse('/diag/sse', undefined, (event, elapsedMs) => {
      if (event.done) { assert(!diagDone, 'DIAG_DUPLICATE_DONE'); diagDone = true; }
      else { assert(!diagDone, 'DIAG_EVENT_AFTER_DONE'); arrivals.push({ seq: event.seq, elapsedMs }); }
    });
    const gaps = arrivals.slice(1).map((event, index) => event.elapsedMs - arrivals[index].elapsedMs);
    assert(diagDone && arrivals.length === 10 && arrivals.every((event, index) => event.seq === index + 1), 'DIAG_INCOMPLETE');
    assert(gaps.filter(gap => gap >= 100).length >= 4 && arrivals.at(-1).elapsedMs - arrivals[0].elapsedMs >= 1500, 'DIAG_BUFFERED');
    passed(stage, { chunks: arrivals.length, totalMs, gapsMs: gaps });
    const pages = [...new Set([...BOUNDARIES.flatMap(target => [target.page - 1, target.page]), ...FORBIDDEN_RELATIONS.map(target => target.page), 46, 47, 304, 411])].sort((a, b) => a - b);
    for (const page of pages) {
      stage = `boundary-${page}`; await progress(page);
      const graph = await json(`${PREFIX}/ssabi/graph`); checkGraph(graph, page);
      const detailTargets = BOUNDARIES.filter(target => page === target.page - 1 || page === target.page || (page === 304 && target.id === ID.pole));
      for (const target of detailTargets) {
        const detail = await json(`${PREFIX}/ssabi/characters/${target.id}`, undefined, page < target.page ? 404 : 200);
        checkDetail(detail, target, page);
      }
      passed(stage, { page, nodes: graph.nodes.length, edges: graph.edges.length, checkedDetails: detailTargets.map(t => t.name) });
    }
    if (options.chat) {
      const attemptsAt = [];
      for (const question of QUESTIONS) {
        // Respect the public limit of 3/device/book/minute without changing device.
        if (attemptsAt.length >= 3) {
          const waitMs = Math.max(0, 61_000 - (Date.now() - attemptsAt[attemptsAt.length - 3]));
          if (waitMs) { emit({ stage: 'chat-rate-limit-wait', waitMs }); await new Promise(resolve => setTimeout(resolve, waitMs)); }
        }
        stage = `chat-${question.page}`; await progress(question.page);
        assert(report.chatRequests < QUESTIONS.length, 'CHAT_BUDGET_EXCEEDED');
        const result = { ...question, status: 'running', answer: '', chunkCount: 0, firstChunkMs: null, lastChunkMs: null, doneMs: null };
        report.chats.push(result); report.chatRequests++; attemptsAt.push(Date.now());
        let done; let sseError = false;
        result.totalMs = await sse(`${PREFIX}/chat`, { query: question.query, page: question.page, seq: ++seq, ...(conversationId === undefined ? {} : { conversationId }) }, (event, elapsedMs) => {
          if (event.type === 'delta') {
            assert(!done && !sseError && typeof event.text === 'string', 'INVALID_DELTA_ORDER');
            if (event.text) { result.firstChunkMs ??= elapsedMs; result.lastChunkMs = elapsedMs; result.chunkCount++; result.answer += event.text; }
          } else if (event.type === 'done') { assert(!done && !sseError, 'INVALID_DONE_ORDER'); done = event; result.doneMs = elapsedMs; }
          else if (event.type === 'error') { sseError = true; }
          else fail('UNKNOWN_CHAT_EVENT');
        });
        assert(!sseError && done, 'CHAT_ERROR_OR_MISSING_DONE');
        assert(done.applied_cutoff === question.page, 'CHAT_CUTOFF_MISMATCH');
        assert(result.answer.trim() && result.chunkCount > 1 && result.firstChunkMs < result.doneMs, 'CHAT_NOT_STREAMED');
        assert(!result.answer.includes('[NO_EVIDENCE]'), 'INTERNAL_TOKEN_EXPOSED');
        assert(done.conversation_id != null && Number.isInteger(Number(done.conversation_id)), 'CONVERSATION_ID_MISSING');
        if (conversationId !== undefined) assert(String(done.conversation_id) === String(conversationId), 'CONVERSATION_NOT_REUSED');
        conversationId = done.conversation_id;
        result.status = 'transport-passed'; result.appliedCutoff = done.applied_cutoff; result.conversationId = conversationId;
        passed(stage, { page: question.page, chunkCount: result.chunkCount, firstChunkMs: result.firstChunkMs, totalMs: result.totalMs, semanticReviewRequired: true });
      }
      stage = 'history-304'; const history = await json(`${PREFIX}/chat/conversations/${conversationId}?expected_page=304`);
      assert(Array.isArray(history.turns) && history.turns.length === QUESTIONS.length * 2, 'HISTORY_TURN_COUNT');
      assert(history.turns.every((turn, index) => turn.role === (index % 2 ? 'assistant' : 'user') && turn.text === (index % 2 ? report.chats[(index - 1) / 2].answer : QUESTIONS[index / 2].query)), 'HISTORY_CONTENT_MISMATCH');
      passed(stage, { turns: history.turns.length });
      stage = 'history-rewind-303'; await progress(303);
      const list = await json(`${PREFIX}/chat/conversations?expected_page=303`);
      assert(Array.isArray(list) && list.length === 0, 'FUTURE_HISTORY_LIST_EXPOSED');
      const hidden = await json(`${PREFIX}/chat/conversations/${conversationId}?expected_page=303`, undefined, 404);
      assert(hidden.error === 'NOT_FOUND' && !hidden.turns, 'FUTURE_HISTORY_DETAIL_EXPOSED');
      for (const suffix of ['', `/${conversationId}`]) {
        const stale = await json(`${PREFIX}/chat/conversations${suffix}?expected_page=304`, undefined, 409);
        assert(stale.error === 'READING_POSITION_CHANGED' && !stale.turns, 'STALE_PAGE_NOT_REJECTED');
      }
      passed(stage, { hiddenDetailStatus: 404, staleListStatus: 409, staleDetailStatus: 409 });
    }
    report.status = options.chat ? 'api-passed-semantic-review-required' : 'api-passed';
    return report;
  } catch (error) {
    report.status = 'failed'; report.failure = { stage, code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'REQUEST_OR_VERIFICATION_FAILED' };
    const active = report.chats.find(chat => chat.status === 'running'); if (active) active.status = 'failed';
    process.exitCode = 1;
    return report;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    emit({ stage: 'summary', status: report.status, output: options.output, networkRequests: report.networkRequests, chatRequests: report.chatRequests, checks: report.checks.length, semanticReview: report.semanticReview, ...(report.failure ? { failure: report.failure } : {}) });
  }
}

if (require.main === module) {
  if (process.argv.includes('--help')) {
    process.stdout.write('Usage: node backend/scripts/verify-takryu-full-repair.cjs [--verify [--chat]] [--self-test] [--api https://origin] [--output report.json]\nDefault: dry-run, no network or model calls. --verify: fresh-device HTTP checks. --chat: additionally six model requests, no retries.\n');
  } else {
    Promise.resolve().then(() => run(parseArgs(process.argv.slice(2)))).catch(error => {
      process.stdout.write(JSON.stringify({ status: 'failed', code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'LOCAL_SETUP_FAILED' }) + '\n');
      process.exitCode = 1;
    });
  }
}
module.exports = { parseArgs, checkGraph, checkDetail, makeSseParser, selfTest, run };
