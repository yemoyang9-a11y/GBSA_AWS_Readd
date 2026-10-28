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

export function buildPrompt(context: ChatbotContext, systemRules: string): string {
  const sections: string[] = [systemRules, '', '# 근거 데이터', ''];
  const nameById = new Map(context.entities.characters.map((c) => [c.id, c.name] as const));

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

  if (context.chapter_summaries.length > 0) {
    sections.push('## 장 요약');
    context.chapter_summaries.forEach((ch) => {
      sections.push(`### ${ch.chapter_no}장 ${ch.title} (p.${ch.start_page}~${ch.end_page})`);
      sections.push(ch.content);
      sections.push('');
    });
  }

  if (context.current_chapter_text) {
    sections.push('## 현재 장 원문 (절단)');
    sections.push(context.current_chapter_text);
    sections.push('');
  }

  if (context.entities.characters.length > 0) {
    sections.push('## 인물');
    context.entities.characters.forEach((char) => {
      sections.push(`- ${char.name} (첫 등장: p.${char.first_appearance_page})`);
    });
    sections.push('');
  }

  if (context.entities.character_notes.length > 0) {
    sections.push('## 인물 노트');
    context.entities.character_notes.forEach((note) => {
      const name = nameById.get(note.character_id) ?? note.character_id;
      sections.push(`- ${name}: ${note.note} (p.${note.source_page})`);
    });
    sections.push('');
  }

  if (context.entities.relationships.length > 0) {
    sections.push('## 인물 관계 (이력)');
    context.entities.relationships.forEach((rel) => {
      const nameA = nameById.get(rel.character_a_id) ?? rel.character_a_id;
      const nameB = nameById.get(rel.character_b_id) ?? rel.character_b_id;
      sections.push(formatRelationship(rel, nameA, nameB));
    });
    sections.push('');
  }

  if (context.entities.terms.length > 0) {
    sections.push('## 용어');
    context.entities.terms.forEach((term) => {
      sections.push(`- **${term.term}**: ${term.definition} (p.${term.first_appearance_page})`);
    });
    sections.push('');
  }

  if (context.entities.events.length > 0) {
    sections.push('## 사건');
    context.entities.events.forEach((event) => {
      sections.push(`- ${event.event} (p.${event.occurrence_page}): ${event.description}`);
    });
    sections.push('');
  }

  if (
    context.entities.characters.length > 0 ||
    context.entities.character_notes.length > 0 ||
    context.entities.relationships.length > 0 ||
    context.entities.terms.length > 0 ||
    context.entities.events.length > 0
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

  return sections.join('\n');
}
