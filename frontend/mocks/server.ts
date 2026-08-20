/**
 * 백엔드 대역 — 서버가 할 일을 흉내 낸다. `VITE_USE_MOCK=true` 일 때만 쓰인다.
 *
 * ⚠️ 여기의 K 필터는 **서버 쿼리의 대역**이다. 실제 상한 강제는 서버 리포지토리가 하며
 *    (`findX(bookId, cutoff, ...)`, 00-shared §2.2), 프론트 화면 코드는 이 필터를 갖지 않는다.
 *    게이트 테스트(자가 검증 1~14)는 **실제 API를 대상으로** 해야 한다 — 이 대역을 상대로
 *    테스트하면 내가 만든 mock 이 내 기대와 같은지만 확인하게 되어 아무것도 증명하지 못한다.
 *
 * 백엔드가 붙으면 이 파일은 지운다.
 */

import {
  MOCK_BOOK_ID,
  mockAliases,
  mockBookInfo,
  mockCatalog,
  mockChapters,
  mockCharacterNotes,
  mockCharacters,
  mockPages,
  mockRelationships,
} from './fixtures';
import type {
  BriefingResponse,
  CatalogResponse,
  CharacterResponse,
  EntryResponse,
  GraphResponse,
  PageResponse,
} from '../src/types';

/**
 * 서버의 기준점 파생 — 이 두 함수가 백엔드 `cutoff.service.ts` 자리를 대신한다.
 * 프론트 런타임 코드가 아니라 **서버 대역**이므로 파생 계산이 여기 있는 것이 맞다.
 */
function deriveCutoff(page: number): number {
  return page - 1;
}

function derivePercent(page: number, total: number): number {
  return (page / total) * 100;
}

/** 디바이스별 현재 페이지. 서버의 reading_position.current_page 대역 */
let currentPage = 21;
let sessionEpoch = 1;

/** 기준점 결정기 대역 — 서버의 유일한 계산 지점 (00-shared §2.1) */
function snapshot() {
  const totalPages = 30;
  const cutoff = deriveCutoff(currentPage);
  const chapter = mockChapters.find((c) => currentPage >= c.start_page && currentPage <= c.end_page);
  return {
    current_page: currentPage,
    cutoff,
    percent: derivePercent(currentPage, totalPages),
    chapter,
    total_pages: totalPages,
  };
}

export function mockEntry(): EntryResponse {
  sessionEpoch += 1;
  return {
    route: 'briefing',
    page: currentPage,
    is_new_session: true,
    session_epoch: sessionEpoch,
  };
}

export function mockRecordProgress(page: number): void {
  currentPage = page;
}

export function mockCatalogResponse(): CatalogResponse {
  const snap = snapshot();
  return {
    books: mockCatalog.map((book) =>
      book.book_id === MOCK_BOOK_ID
        ? { ...book, progress: { current_page: snap.current_page, percent: snap.percent } }
        : book
    ),
  };
}

export function mockInfoResponse() {
  return mockBookInfo;
}

export function mockPageResponse(pageNo: number): PageResponse {
  return {
    page_no: pageNo,
    content: mockPages[pageNo] ?? '',
    prev_page: pageNo > 1 ? pageNo - 1 : null,
    next_page: pageNo < 30 ? pageNo + 1 : null,
  };
}

export function mockBriefingResponse(): BriefingResponse {
  const snap = snapshot();
  return {
    applied_cutoff: snap.cutoff,
    recap:
      snap.cutoff === 0
        ? null
        : `${snap.cutoff}페이지까지의 줄거리입니다. 정 주사는 미두장에서 재산을 잃었고... (mock 저장 리캡)`,
    current_chapter: {
      chapter_no: snap.chapter?.chapter_no ?? 1,
      title: snap.chapter?.title ?? '',
    },
    progress: {
      current_page: snap.current_page,
      total_pages: snap.total_pages,
      percent: snap.percent,
    },
  };
}

/** 관계도 — 서버 쿼리 대역. 노드·간선·별칭 전부 K 이하만 (FR-SPL-002 🚦, D6, A6) */
export function mockGraphResponse(): GraphResponse {
  const { cutoff: k } = snapshot();

  const nodes = mockCharacters
    .filter((c) => c.first_appearance_page <= k)
    .map((c) => ({
      id: c.id,
      name: c.name,
      first_appearance_page: c.first_appearance_page,
      aliases: mockAliases
        .filter((a) => a.character_id === c.id && a.first_appearance_page <= k)
        .map((a) => a.alias),
    }));

  const nodeIds = new Set(nodes.map((n) => n.id));

  // 같은 쌍에서 확립 페이지가 가장 늦은 것 1개만 남긴다 (A6, FR-CHR-001 🚦 간선 중복 없음)
  const latestByPair = new Map<string, (typeof mockRelationships)[number]>();
  for (const rel of mockRelationships.filter((r) => r.established_page <= k)) {
    const key = [rel.a, rel.b].sort().join('|');
    const kept = latestByPair.get(key);
    if (!kept || rel.established_page > kept.established_page) latestByPair.set(key, rel);
  }

  const edges = [...latestByPair.values()]
    // 양 끝 노드가 결과 집합에 있을 때만 (FR-SPL-005 🚦 심층 방어)
    .filter((rel) => nodeIds.has(rel.a) && nodeIds.has(rel.b))
    .map((rel) => ({
      source: rel.a,
      target: rel.b,
      label: rel.label,
      established_page: rel.established_page,
    }));

  return { nodes, edges };
}

export function mockCharacterResponse(characterId: string): CharacterResponse | null {
  const { cutoff: k } = snapshot();
  const character = mockCharacters.find((c) => c.id === characterId && c.first_appearance_page <= k);
  if (!character) return null; // 쿼리 결과 0행 → 404. 초과 여부를 판별한 게 아니다 (절대 규칙 7번)

  const notes = mockCharacterNotes
    .filter((n) => n.character_id === characterId && n.source_page <= k)
    .map((n) => n.note);

  return {
    name: character.name,
    first_appearance_page: character.first_appearance_page,
    aliases: mockAliases
      .filter((a) => a.character_id === characterId && a.first_appearance_page <= k)
      .map((a) => ({
        alias: a.alias,
        type: a.alias_type,
        first_appearance_page: a.first_appearance_page,
      })),
    notes: notes.join(' '),
  };
}

/** 리캡·챗봇 스트림 대역 — SSE_SPEC.md 형식 그대로 (delta/done/error) */
export async function* mockStream(text: string): AsyncGenerator<string> {
  const { cutoff } = snapshot();
  for (const piece of text.match(/.{1,8}/gu) ?? []) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    yield `data: ${JSON.stringify({ type: 'delta', text: piece })}\n\n`;
  }
  yield `data: ${JSON.stringify({ type: 'done', applied_cutoff: cutoff })}\n\n`;
}
