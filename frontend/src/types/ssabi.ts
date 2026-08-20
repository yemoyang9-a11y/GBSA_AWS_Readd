/**
 * 싸비 조회 타입 — API_CONTRACT.md 10·11번 (R4 제공).
 * 모든 필드는 기준점 K 이하로 이미 걸러져 내려온다. 프론트는 초과 여부를 판별하지 않는다
 * (절대 규칙 7번).
 */

/** 관계도 노드 = 인물. 최초 등장 <= K (FR-SPL-002 🚦) */
export interface GraphNode {
  id: string;
  name: string;
  first_appearance_page: number;
  /** 별칭도 최초 등장 <= K 로 걸러진 것만 (D6) */
  aliases: string[];
}

/** 관계도 간선 = 관계. 확립 페이지 <= K 중 최신 라벨 1개만 (A6, FR-CHR-001 🚦) */
export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  established_page: number;
}

/** GET /books/:bookId/ssabi/graph */
export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  // TODO(계약 미확정) applied_cutoff(적용된 K)가 응답에 없다. NFR-OBS-003 이 이를 요구하고,
  //   없으면 FR-SPL-002 🚦 판정 자체가 불가능하다 — team-sync-r4.md §4.2 (🔴).
}

export interface CharacterAlias {
  alias: string;
  type: string;
  first_appearance_page: number;
}

/** GET /books/:bookId/ssabi/characters/:characterId — 노드 선택과 본문 인물명 탭이 같은 응답 */
export interface CharacterResponse {
  name: string;
  first_appearance_page: number;
  aliases: CharacterAlias[];
  /** 근거 페이지 <= K, 최대 8문장. 초과 시 최초 1 + 최근 7 (A5) — 절단은 서버가 한다 */
  notes: string;
}

/** 싸비 사이드창 3탭. 최초 열기 기본값은 관계도 (FR-SVB-002) */
export type SsabiTab = 'recap' | 'relationship' | 'chatbot';
