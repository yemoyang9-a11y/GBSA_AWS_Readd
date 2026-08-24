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
  mockPageContent,
  mockRelationships,
} from './fixtures';
import type {
  SseFrame,
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

/**
 * 저장 리캡 대역 — 사용자·도서당 1건 (FR-DAT-009).
 * **재사용은 기준점 완전 일치 시에만** 한다 (FR-DAT-010, R8). 진도가 움직이면 저장분이
 * 무효가 되어 `recap: null` 로 내려가고, 클라이언트가 스트리밍 폴백을 부른다.
 */
const savedRecap = { cutoff: 20, text: '20페이지까지의 줄거리입니다. 정 주사는 미두장에서 재산을 잃었습니다. (mock 저장 리캡)' };

/** 기준점 결정기 대역 — 서버의 유일한 계산 지점 (00-shared §2.1) */
function snapshot(page = currentPage) {
  const totalPages = 30;
  const cutoff = deriveCutoff(page);
  const chapter = mockChapters.find((c) => page >= c.start_page && page <= c.end_page);
  return {
    current_page: page,
    cutoff,
    percent: derivePercent(page, totalPages),
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
  // 범위 밖 pageNo(예: 0)가 들어와도 page_no·content·prev/next_page가 서로 어긋나지
  // 않게, 한 번 접은 값에서 전부 파생한다(2026-08-24 — 접은 content만 쓰고 page_no는
  // 안 접었더니 "0페이지인데 1페이지 본문"처럼 필드끼리 모순되던 버그를 고침).
  const page = Math.min(30, Math.max(1, pageNo));
  return {
    page_no: page,
    content: mockPageContent(page),
    prev_page: page > 1 ? page - 1 : null,
    next_page: page < 30 ? page + 1 : null,
  };
}

export function mockBriefingResponse(): BriefingResponse {
  const snap = snapshot();
  return {
    applied_cutoff: snap.cutoff,
    // 기준점이 저장분과 정확히 같을 때만 재사용한다 (FR-DAT-010, R8)
    recap: snap.cutoff === savedRecap.cutoff ? savedRecap.text : null,
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
export function mockGraphResponse(page?: number): GraphResponse {
  // 요청에 동봉된 page 를 진도 이벤트와 동일하게 처리한 뒤 기준점을 파생한다 (00-shared §2.5)
  if (page !== undefined) currentPage = page;
  const { cutoff: k } = snapshot(page);

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

export function mockCharacterResponse(
  characterId: string,
  page?: number
): CharacterResponse | null {
  if (page !== undefined) currentPage = page;
  const { cutoff: k } = snapshot(page);
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

/**
 * 리캡·챗봇 스트림 대역 — SSE_SPEC.md 형식 그대로 (delta/done/error).
 * 실제 경로는 fetch 응답을 readSseStream 이 파싱하지만, 대역은 프레임을 바로 내보낸다.
 */
export async function* mockStreamFrames(text: string): AsyncGenerator<SseFrame> {
  const { cutoff } = snapshot();
  // s(dotAll) 플래그 필수 — 기본 `.`은 개행을 안 잡아서 문단 구분(\n\n)이 청크 분할 중에
  // 통째로 사라진다(2026-08-24 확인, RecapTab 문단 분리 검증 중 발견).
  for (const piece of text.match(/.{1,8}/gsu) ?? []) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    yield { type: 'delta', text: piece };
  }
  yield { type: 'done', applied_cutoff: cutoff };
}

/** 저장 리캡이 없을 때의 실시간 생성분 (FR-DAT-010 — 영구 저장하지 않는다) */
export function mockRecapText(): string {
  const { cutoff } = snapshot();
  // 문단 분리·인물명 강조 UI를 mock 모드에서도 확인할 수 있게 두 문단 + 실제 mockAliases
  // 이름으로 구성한다(2026-08-24).
  return (
    `${cutoff}페이지까지의 줄거리입니다. 정 주사는 미두장을 드나들며 재산을 잃고, ` +
    `딸 초봉을 시집보내 형편을 펴 보려 한다.\n\n` +
    `초봉은 제중당 약국에서 일하며 이웃 남승재와 가깝게 지내 왔지만, 은행원 고태수와 ` +
    `약혼하며 상황이 달라졌다. (mock 실시간 리캡)`
  );
}

/**
 * 챗봇 답변 대역. 근거 부재 문구도 일반 delta 로 흘린다 (FR-QNA-004 🚦) —
 * 프론트가 거절 여부를 판별하지 않게 하려는 것이 이 규칙의 요지다.
 */
export function mockChatAnswer(query: string): string {
  const { cutoff } = snapshot();
  const known = mockCharacters.filter((c) => c.first_appearance_page <= cutoff);
  const mentioned = known.find((c) => query.includes(c.name));

  if (!mentioned) {
    return '현재까지 읽은 페이지 기준으로 알 수 없는 내용입니다. 다른 질문 해주세요.';
  }
  return `${mentioned.name}에 대해 ${cutoff}페이지까지의 내용으로 답하면, 아직 드러난 것은 많지 않습니다. (mock 답변)`;
}
