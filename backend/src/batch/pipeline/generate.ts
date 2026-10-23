/**
 * S4 준비 — 생성 6종 프롬프트 + 응답 파싱
 *
 * 게이트웨이(⑥) 경유만 허용 — 4.3절. 이 파일은 프롬프트만 만들고 실제 호출은
 * run-generate-sample.ts(표본 검증)·향후 generate.ts 실행기에서 gateway.call()로 한다.
 *
 * 파이프라인은 상한 개념이 없다(CLAUDE.md 2장 6번 예외) — 각 장은 그 장 원문만
 * 보되, 위치 태깅은 실제 페이지 번호로 한다. 상한 필터는 조회 시점(R2·R3·R4)에서만 건다.
 */
import { Chapter, Page } from '../../shared/types';
export { validateGroundedChapter } from './grounding';

/** LLM이 페이지 번호를 정확히 인용할 수 있도록 원문에 페이지 표시를 단다 */
export function buildPageTaggedText(pages: Page[]): string {
  return pages.map((p) => `[페이지 ${p.page_no}]\n${p.content}`).join('\n\n');
}

/** 장 요약 — FR-DAT-003 🚦. 입력은 "장 단위"(해당 장 원문만) — 이후 사건이 물리적으로 없다 */
export function buildSummaryPrompt(chapter: Chapter, pages: Page[]): string {
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문 전체다.
이 장에서 벌어지는 사건만 3~5문장으로 요약하라. 이 장 이후에 일어나는 일은 절대 언급하지 마라(알더라도 금지).
출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"summary": "..."}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 인물 + 별칭 + 인물 노트 — FR-DAT-004, D6(전 별칭 태깅), A5(노트 상한) */
export function buildCharacterPrompt(
  chapter: Chapter,
  pages: Page[],
  knownCharacterNames: string[]
): string {
  const known =
    knownCharacterNames.length > 0 ? knownCharacterNames.join(', ') : '(없음 — 이 장이 첫 장)';
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
이 장에서 처음 등장하거나 언급되는 인물을 전부 추출하라.

규칙:
- 대표명과 최초 등장 페이지(원문의 [페이지 N] 기준, 정확히 그 숫자를 인용)
- 별칭: 원문 표기가 다른 경우(1937년작 특유의 고어체·방언·띄어쓰기 변형 포함), 호칭·직함·가족관계 호칭을 전부 별칭으로 등록. 유형은 name(이름 표기 변형) / title(직함) / kinship(가족관계 호칭) / nickname(그 외 호칭) 중 하나, 각 별칭의 최초 등장 페이지도 표시
- 인물 노트: 이 인물을 설명하는 서술 문장을 문장당 1개씩, 근거 페이지와 함께. 이 장에서는 인물당 최대 2문장까지만
- 이미 등장한 인물: ${known}. name은 현재 원문 표기를 사용한다. 나중에 알려지는 본명으로 앞부분의 이름을 바꾸지 않는다.
- entity_type은 person/non_person/uncertain 중 하나다. person은 인간만이 아니라 대화하거나 독립적으로 행동하는 동물·AI 등 비인간 서사 행위자도 포함하는 등장인물 분류다. non_person은 비행위자인 사물·장소다. 사물 형태의 이름도 인물의 별명일 수 있다. 단순히 이름이 나온다는 이유로 인물이 되지 않는다. 행동·대사·서술에 근거한 rationale을 쓴다. 불확실한 후보도 uncertain으로 남긴다.
- identity_status는 기존 인물과 동일하면 same, 처음 등장하거나 별개인 인물이면 distinct, 동일인 여부가 모호하면 uncertain이다. rationale에 동일인 판정 이유도 쓴다. 동명이인·공유 호칭을 임의로 합치지 않는다.
- 인물·별칭 대응·노트마다 독립적인 evidence와 rationale을 쓴다. evidence는 source_page와 quote다. quote는 이름과 문맥을 포함한 해당 페이지의 정확한 부분 문자열이다. 유일한 인용이면 서버가 위치를 계산한다. 같은 인용이 반복되는 경우에만 start_char, end_char를 추가하며 페이지 본문의 0 기반 UTF-16 문자 위치이고 end_char는 제외한다.
- 인물 first_appearance_page와 노트 source_page는 각 근거 페이지다. 앞 장의 등장 페이지를 추측하지 않는다. 검증이 늦으면 앞 페이지로 소급하지 않는다.
- 별칭 evidence는 name과 alias 양쪽을 포함하여 동일인임을 보여야 한다. identity_established_page는 그 근거 페이지다. 별칭 첫 등장만으로 동일인 확립을 소급하지 않는다. 두 이름의 단순 동시 등장은 동일인 근거가 아니다.
- 별칭은 한 인물을 실제로 지칭하는 독립된 명사형 표기만 등록한다. 조사·어미가 붙은 일부, 발언 문장, 외모/행동 설명문, 가족·내외 같은 집합은 개인 별칭이 아니다. 친구/동료는 가족호칭(kinship)이 아니며 직업은 title이다. 묘사 수식어가 추가된 별명은 단순 이름 표기(name)가 아니다.
- 별칭 자체의 지시 대상을 reference_type=person_label/description/collective/utterance/non_person/uncertain으로 독립 분류한다. 같은 문장에 대표명이 있어도 그 별칭이 해당 개인을 가리키지 않으면 person_label이 아니다. 다른 사람·사물 지칭, 불명확한 대명사를 억지로 연결하지 않는다. 서버는 person_label만 자동 승인하며 나머지 후보와 근거는 검수에 남긴다.
- 현재 장 안에서 같은 이름이 먼저 나왔다면 최초 인용을 우선 확인한다. 인물의 직업이나 별명의 유래를 나중에 알게 되었다고 최초 등장을 늦추지 않는다. 앞선 같은 표기가 사물이나 동명이인이라면 earlier_mentions에 source_page, kind(non_person|different_person), rationale, evidence를 각각 기록한다. 근거 없는 제외나 이름만 보고 소급하는 것은 금지한다. 서버는 설명되지 않은 앞선 표기가 있으면 인물을 검수 보류한다.

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"characters": [{"name": "...", "first_appearance_page": 0, "entity_type": "person|non_person|uncertain", "identity_status": "same|distinct|uncertain", "rationale": "사람 판정과 동일인 여부의 이유", "evidence": {"source_page": 0, "quote": "...", "start_char": 0, "end_char": 0}, "earlier_mentions": [], "aliases": [{"alias": "...", "type": "name|title|kinship|nickname", "reference_type": "person_label|description|collective|utterance|non_person|uncertain", "first_appearance_page": 0, "identity_established_page": 0, "rationale": "...", "evidence": {"source_page": 0, "quote": "...", "start_char": 0, "end_char": 0}}], "notes": [{"note": "...", "source_page": 0, "rationale": "...", "evidence": {"source_page": 0, "quote": "...", "start_char": 0, "end_char": 0}}]}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 관계 — FR-DAT-005, A6(이력형 복수 행), 확립 페이지 = 명시적 근거 페이지 */
export function buildRelationshipPrompt(
  chapter: Chapter,
  pages: Page[],
  knownCharacterNames: string[],
  previousRelationships: string[] = []
): string {
  const known =
    knownCharacterNames.length > 0 ? knownCharacterNames.join(', ') : '(없음 — 이 장이 첫 장)';
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
이 장에서 드러나는 인물 간 관계를 추출하라.

규칙:
- 이름 문자열은 이 원문과 아래 인물 목록에 나온 표기를 사용한다. 각 관계는 누가 누구에게 무엇을 하는지 설명한다. 장르/작품 기억으로 보충하지 않는다.
- label은 짧고 구체적인 술어/관계다(예: "성적으로 탐낸다", "고용한다", "아버지다", "협박한다"). "욕망", "감정", "관계"처럼 대상/의미를 알 수 없는 추상 명사는 금지한다. summary는 두 이름을 모두 넣은 한 문장으로 해당 술어의 구체적인 의미를 설명한다. rationale는 그 해석을 뒷받침하는 원문 문맥이다.
- direction은 입력 character_a/b 기준 a_to_b(주체 A→대상 B), b_to_a(주체 B→대상 A), mutual(양쪽에 동일한 관계가 명시됨), undirected(방향이 없는 관계), unknown(방향 불명)이다. 사랑/미움/욕망은 일방일 수 있으며 서로 사랑함으로 승격하지 않는다. 아버지→자녀 등 역할이 다른 가족도 방향이 있다. 알 수 없으면 unknown으로 보류할 문맥을 남긴다.
- kind는 family/social/emotion/action. 같은 두 인물의 가족·고용·감정·행동은 별도 행으로 공존한다. relation_key는 두 인물 사이의 같은 의미 이력을 추적하는 영어 소문자 키다(예: parenthood, employment, affection, marriage). 라벨 문구가 달라도 같은 이력에는 앞서 사용한 키를 재사용한다. 다른 의미를 덮어쓰지 않는다.
- temporal_scope=ongoing은 지속 관계/감정, event는 해당 페이지의 일회 행동이다. 동일 행위가 다른 페이지에 실제 반복되면 별개 event다. state=active는 그 시점 성립/진행, ended는 원문에서 종료가 명시된 이력이다. 종료 페이지를 앞선 관계 행에 소급해 넣지 않는다.
- 확립 페이지 = 해당 의미와 방향 및 지위가 확인되는 evidence.source_page. evidence는 두 이름을 모두 포함한 한 페이지의 정확한 부분 문자열이다. 유일한 인용은 서버가 위치를 계산한다. 반복 인용에만 start_char/end_char를 0 기반 UTF-16 위치로 쓰며 end_char는 제외한다. 명확한 한 페이지 근거를 잡을 수 없으면 추측하지 말고 검수 후보로 남긴다.
- assertion_status는 fact/belief/claim/rumor/uncertain/negated다. fact는 서술로 확인되는 사실만이다. 인물의 추측·거짓말·소문을 사실로 바꾸지 않는다. belief/claim/rumor/uncertain은 attribution에 근거에 명시된 주장/믿음 주체의 이름을 넣고 summary에도 그 이름과 "믿는다/주장한다/소문/불확실하다" 같은 한정을 명시한다. negated는 부정된 내용임을 summary에 명시한다. 인용 다음 문맥의 부정·오해도 확인한다. 계획은 성립한 혼인/친족이 아니라 구체적인 제안/계획 행위로 적거나 보류한다.
- change_type은 establishment/restatement/transition/disclosure. 동일 관계 이력의 재서술은 restatement이며 새 확립 날짜를 만들지 않는다. 실제 상태 변화는 transition, 새 사실 공개는 disclosure다. transition/disclosure 또는 ended에는 같은 확립 페이지의 별도 정확한 change_evidence가 필수다. 새로운 독립 relation_key는 establishment로 추가할 수 있다.
- semantics는 version=2의 완전한 계약이며 evidence/assertion_status/change_evidence는 상위 값과 동일하다. 구체적인 의미가 불명확하면 확신을 꾸미지 않는다. 서버 검증은 정확한 인용/구조의 검사이며 작품 해석의 진실을 보증하지 않으므로 사람 검수 전 후보다.
- 이미 등장한 인물: ${known}
- 앞 장까지의 관계 이력(서로 다른 의미 병존): ${previousRelationships.length ? previousRelationships.join('; ') : '(없음)'}

출력은 JSON만 반환한다. 완전한 예시 형태:
{"relationships":[{"character_a":"주체 이름","character_b":"대상 이름","label":"구체적인 술어","established_page":1,"assertion_status":"fact","change_type":"establishment","rationale":"원문이 의미와 방향을 뒷받침하는 이유","evidence":{"source_page":1,"quote":"두 이름과 관계가 포함된 정확한 원문"},"semantics":{"version":2,"direction":"a_to_b","kind":"emotion","relation_key":"affection","summary":"주체 이름은 대상 이름에게 어떤 감정을 느낀다.","assertion_status":"fact","temporal_scope":"ongoing","state":"active","evidence":{"source_page":1,"quote":"동일한 정확한 원문"}}}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 배경지식·소개 — FR-DAT-006, R5(상한 없음, 1페이지 시점에도 안전해야 함) */
export function buildBackgroundPrompt(title: string, author: string): string {
  return `${author}의 장편소설 「${title}」(1937~1938년 조선일보 연재)에 대한 배경지식과 책 소개를 작성하라.

절대 규칙: 이 소설의 결말, 구체적 사건, 인물의 운명·관계 변화를 절대 언급하지 마라. 이 책을 1페이지도 읽지 않은 독자가 봐도 완전히 안전해야 한다.
- background: 시대 배경(1930년대 일제강점기 조선), 작품의 소재·무대(미두장, 군산), 읽기 포인트(문체 특징 등). 사건 언급 금지
- intro: 작품을 소개하는 글. 줄거리 요약이나 결말 암시 없이, 어떤 분위기·주제의 작품인지만

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"background": "...", "intro": "..."}`;
}

/** 용어 — FR-DAT-007 */
export function buildTermPrompt(chapter: Chapter, pages: Page[]): string {
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
현대 독자가 이해하기 어려운 용어(방언, 고어, 1930년대 전문용어 — 예: 미두장, 하바꾼 등)를 추출하고 뜻을 설명하라. 최초 등장 페이지를 표시하라.
응답 길이 제한이 있으니 이 장에서 가장 중요하고 대표적인 용어 위주로 **최대 15개까지만** 추려라.

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"terms": [{"term": "...", "definition": "...", "first_appearance_page": 0}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 사건 — FR-DAT-008 */
export function buildEventPrompt(chapter: Chapter, pages: Page[]): string {
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
이 장에서 벌어진 주요 사건(타임라인에 남을 사건)을 추출하라. 발생 페이지를 표시하라.

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"events": [{"event": "...", "description": "...", "occurrence_page": 0}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** LLM 응답에서 JSON을 안전하게 뽑아낸다(마크다운 코드블록으로 감싸는 경우 대응) */
export function parseJsonResponse<T>(raw: string): T {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`JSON을 찾을 수 없음: ${raw.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}
