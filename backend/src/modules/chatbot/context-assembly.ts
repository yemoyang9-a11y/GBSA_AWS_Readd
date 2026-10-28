import type {
  ChatbotContext,
  ChatbotChapterSummary,
  Character,
  Relationship,
  RelationshipSemantics,
  CharacterNote,
  Term,
  Event,
} from '../../shared/types';
import * as repo from './repository';

export async function assembleContext(
  bookId: string,
  K: number // cutoff (기준점)
): Promise<ChatbotContext> {
  const book = await getBookMeta(bookId);

  const chapterSummaries = await findChapterSummaries(bookId, K);

  const currentChapterText = await getCurrentChapterText(bookId, K);

  const characters = await findCharacters(bookId, K);
  const relationships = await findRelationships(bookId, K); // A6: 이력 전체, 페이지 병기
  const characterNotes = await findCharacterNotes(bookId, K);
  const terms = await findTerms(bookId, K);
  const events = await findEvents(bookId, K);

  // Whole-book generated background has no cutoff-scoped source provenance.
  const background = '';

  return {
    book,
    chapter_summaries: chapterSummaries,
    current_chapter_text: currentChapterText,
    entities: {
      characters,
      relationships,
      character_notes: characterNotes,
      terms,
      events,
    },
    background,
  };
}

async function getBookMeta(bookId: string): Promise<{ title: string; author: string }> {
  return repo.getBookMeta(bookId);
}

async function findChapterSummaries(bookId: string, K: number): Promise<ChatbotChapterSummary[]> {
  return repo.findChapterSummaries(bookId, K);
}

async function getCurrentChapterText(bookId: string, K: number): Promise<string | null> {
  return repo.getCurrentChapterText(bookId, K);
}

async function findCharacters(bookId: string, K: number): Promise<Character[]> {
  return repo.findCharacters(bookId, K);
}

async function findRelationships(bookId: string, K: number): Promise<Relationship[]> {
  return repo.findRelationships(bookId, K);
}

async function findCharacterNotes(bookId: string, K: number): Promise<CharacterNote[]> {
  return repo.findCharacterNotes(bookId, K);
}

async function findTerms(bookId: string, K: number): Promise<Term[]> {
  return repo.findTerms(bookId, K);
}

async function findEvents(bookId: string, K: number): Promise<Event[]> {
  return repo.findEvents(bookId, K);
}

const ASSERTION_LABEL: Record<RelationshipSemantics['assertion_status'], string> = {
  fact: '사실',
  belief: '인물의 믿음',
  claim: '인물의 주장',
  rumor: '소문',
  uncertain: '불확실',
  negated: '부정 — 성립하지 않음',
};

/**
 * R10 · FR-CHR-001: semantics가 있으면 방향대로 주어·목적어를 쓰고 확정 여부·종료를 함께 싣는다.
 * 저장 순서(character_a/b)는 방향이 아니다. semantics가 없는 기존 행은 형식을 바꾸지 않는다.
 */
function formatRelationship(rel: Relationship, nameA: string, nameB: string): string {
  const page = `(확립: p.${rel.established_page})`;
  const s = rel.semantics;
  if (!s) return `- ${nameA} - ${nameB}: ${rel.label} ${page}`;

  const pair =
    s.direction === 'a_to_b'
      ? `${nameA} → ${nameB}`
      : s.direction === 'b_to_a'
        ? `${nameB} → ${nameA}`
        : s.direction === 'mutual'
          ? `${nameA} ↔ ${nameB}`
          : s.direction === 'unknown'
            ? `${nameA} - ${nameB} (방향 미확인)`
            : `${nameA} - ${nameB}`;
  const status = [
    ASSERTION_LABEL[s.assertion_status] + (s.attribution ? `(${s.attribution})` : ''),
    ...(s.temporal_scope === 'event' ? ['일회성 사건'] : []),
    ...(s.state === 'ended' ? ['종료됨'] : []),
  ].join(', ');
  return `- ${pair}: [${status}] ${rel.label} — ${s.summary} ${page}`;
}

type ChatbotEntities = ChatbotContext['entities'];

function pushBookInfo(sections: string[], context: ChatbotContext): void {
  if (context.book.title || context.book.author) {
    sections.push('## 책 정보');
    if (context.book.title) sections.push(`- 제목: ${context.book.title}`);
    if (context.book.author) sections.push(`- 저자: ${context.book.author}`);
    sections.push(
      '(위 책 정보는 특정 페이지에 속한 내용이 아닙니다. 이 정보로 답할 때는 페이지 번호를 붙이지 마세요 — ' +
        '지어내지도 말고, "페이지 정보 없음"처럼 없다는 사실을 언급하지도 말고, 그냥 조용히 생략하세요.)'
    );
    sections.push('');
  }
}

function pushSummaries(sections: string[], summaries: ChatbotChapterSummary[]): void {
  if (summaries.length > 0) {
    sections.push('## 장 요약');
    summaries.forEach((ch) => {
      sections.push(`### ${ch.chapter_no}장 ${ch.title} (p.${ch.start_page}~${ch.end_page})`);
      sections.push(ch.content);
      sections.push('');
    });
  }
}

const CURRENT_CHAPTER_HEADING = '## 현재 장 원문 (절단)';

function pushEntities(
  sections: string[],
  entities: ChatbotEntities,
  nameById: Map<string, string>
): void {
  if (entities.characters.length > 0) {
    sections.push('## 인물');
    entities.characters.forEach((char) => {
      sections.push(`- ${char.name} (첫 등장: p.${char.first_appearance_page})`);
    });
    sections.push('');
  }

  if (entities.character_notes.length > 0) {
    sections.push('## 인물 노트');
    entities.character_notes.forEach((note) => {
      const name = nameById.get(note.character_id) ?? note.character_id;
      sections.push(`- ${name}: ${note.note} (p.${note.source_page})`);
    });
    sections.push('');
  }

  if (entities.relationships.length > 0) {
    sections.push('## 인물 관계 (이력)');
    entities.relationships.forEach((rel) => {
      const nameA = nameById.get(rel.character_a_id) ?? rel.character_a_id;
      const nameB = nameById.get(rel.character_b_id) ?? rel.character_b_id;
      sections.push(formatRelationship(rel, nameA, nameB));
    });
    sections.push('');
  }

  if (entities.terms.length > 0) {
    sections.push('## 용어');
    entities.terms.forEach((term) => {
      sections.push(`- **${term.term}**: ${term.definition} (p.${term.first_appearance_page})`);
    });
    sections.push('');
  }

  if (entities.events.length > 0) {
    sections.push('## 사건');
    entities.events.forEach((event) => {
      sections.push(`- ${event.event} (p.${event.occurrence_page}): ${event.description}`);
    });
    sections.push('');
  }
}

function pushEntityNote(sections: string[], entities: ChatbotEntities): void {
  if (
    entities.characters.length > 0 ||
    entities.character_notes.length > 0 ||
    entities.relationships.length > 0 ||
    entities.terms.length > 0 ||
    entities.events.length > 0
  ) {
    sections.push(
      '(위 인물·인물 노트·인물 관계·용어·사건에 명시된 사실은 답변의 근거입니다. ' +
        '이 목록은 읽은 범위의 모든 사실을 담은 전수 자료가 아닙니다. 질문의 전제가 자료와 다르면 ' +
        '질문이 확인하려는 명제부터 판단하고 확인된 사실로 바로잡으세요. 관련된 다른 사실을 설명하는 것으로 ' +
        '질문의 전제를 긍정하지 마세요. 목록에서 찾지 못한 속성은 현재 제공된 자료로 확인하지 ' +
        '못했다고만 말하세요. 그 속성이 읽은 부분이나 작품에 없다는 뜻으로 바꾸지 마세요.)'
    );
    sections.push('');
  }
}

/**
 * A8-2 — 공급자 접두 캐시가 맞도록 **같은 근거를 배치만 바꿔** 렌더링한다.
 *
 * FR-SPL-002 🚦, R4: 데이터 선택은 assembleContext(bookId, K)가 이미 끝냈다. 여기서는 그 결과를
 * 걸러 내거나 넓히지 않고, 페이지로 나눠 배치만 한다. 기준점·cutoff 계산은 없다.
 *
 * 배치(같은 장 안에서 K가 늘면 뒤에만 덧붙는다):
 *   a. 책 정보 + 현재 장 이전 장 요약 + 현재 장 시작 전 페이지의 엔티티
 *   b. 현재 장 원문(장 시작..K)
 *   c. 현재 장 요약(K가 장 끝이면 저장소가 함께 준다) + 현재 장 안 페이지의 엔티티 + 설명문(고정)
 * 현재 장 시작은 현재 장 원문의 첫 쪽이다. 원문이 없으면 선택된 장 요약의 마지막 종료 페이지 다음 쪽이다.
 * 관계는 (인물 쌍, 확립 페이지, id), 나머지 목록은 (페이지, id) 순으로 정렬해 결정적이다 — A6 이력이
 * 블록 안에서 쌍끼리 모인다.
 */
export function buildStableContext(context: ChatbotContext): string {
  return buildStableContextParts(context).join('');
}

/**
 * A8-2: 위 배치를 [a, b의 쪽 하나씩…, c] 조각으로 나눈다. 각 조각 끝이 공급자 캐시 지점이 된다.
 * 공급자는 새 요청에 표시된 지점에서만 이전 캐시를 찾는다. 쪽마다 지점을 두면 K가 늘어도
 * 이전 K 쪽 끝 지점이 새 요청에 그대로 남아 거기까지 캐시를 읽는다.
 * 조각 사이 구분 문자는 조각 안에 들어 있다 — 구분자 없이 이어 붙이면 그대로 원래 문자열이다.
 */
export function buildStableContextParts(context: ChatbotContext): string[] {
  const nameById = new Map(context.entities.characters.map((c) => [c.id, c.name] as const));
  const firstPage = context.current_chapter_text?.match(/^\[p\.(\d+)\]\n/)?.[1];
  const chapterStart = firstPage
    ? Number(firstPage)
    : context.chapter_summaries.reduce((start, ch) => Math.max(start, ch.end_page + 1), 1);

  const byId = (x: { id: string }, y: { id: string }) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  function split<T extends { id: string }>(
    items: T[],
    page: (item: T) => number,
    order: (x: T, y: T) => number = (x, y) => page(x) - page(y) || byId(x, y)
  ): [T[], T[]] {
    const sorted = [...items].sort(order);
    return [
      sorted.filter((item) => page(item) < chapterStart),
      sorted.filter((item) => page(item) >= chapterStart),
    ];
  }

  const { characters, character_notes, relationships, terms, events } = context.entities;
  const [charsBefore, charsCurrent] = split(characters, (c) => c.first_appearance_page);
  const [notesBefore, notesCurrent] = split(character_notes, (n) => n.source_page);
  const [relsBefore, relsCurrent] = split(
    relationships,
    (r) => r.established_page,
    (x, y) =>
      x.character_a_id.localeCompare(y.character_a_id) ||
      x.character_b_id.localeCompare(y.character_b_id) ||
      x.established_page - y.established_page ||
      byId(x, y)
  );
  const [termsBefore, termsCurrent] = split(terms, (t) => t.first_appearance_page);
  const [eventsBefore, eventsCurrent] = split(events, (e) => e.occurrence_page);
  const [summariesBefore, summariesCurrent] = split(
    context.chapter_summaries.map((ch) => ({ ...ch, id: String(ch.chapter_no) })),
    (ch) => ch.start_page
  );

  const head: string[] = ['# 근거 데이터', ''];
  pushBookInfo(head, context);
  pushSummaries(head, summariesBefore);
  pushEntities(
    head,
    {
      characters: charsBefore,
      character_notes: notesBefore,
      relationships: relsBefore,
      terms: termsBefore,
      events: eventsBefore,
    },
    nameById
  );

  const tail: string[] = [];
  pushSummaries(tail, summariesCurrent);
  pushEntities(
    tail,
    {
      characters: charsCurrent,
      character_notes: notesCurrent,
      relationships: relsCurrent,
      terms: termsCurrent,
      events: eventsCurrent,
    },
    nameById
  );
  pushEntityNote(tail, context.entities);

  if (!context.current_chapter_text) return [head.join('\n'), `\n${tail.join('\n')}`];

  // 저장소가 쪽을 `[p.N]\n본문`으로 만들어 '\n\n'로 잇는다. 그 경계에서만 자른다 — 형식이 달라
  // 경계를 못 찾으면 원문 전체가 한 조각이 될 뿐 근거는 그대로다.
  const pages = context.current_chapter_text.split(/\n\n(?=\[p\.\d+\]\n)/);
  return [
    head.join('\n'),
    ...pages.map((page, i) => (i === 0 ? `\n${CURRENT_CHAPTER_HEADING}\n${page}` : `\n\n${page}`)),
    `\n${['', ...tail].join('\n')}`,
  ];
}
