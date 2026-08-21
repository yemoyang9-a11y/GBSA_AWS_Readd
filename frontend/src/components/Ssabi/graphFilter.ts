import type { GraphResponse } from '../../types';

/**
 * 관계도 되감기 — 읽은 범위 안에서 과거 시점의 관계도를 보는 기능.
 *
 * ## 왜 이렇게 만드는가
 *
 * 서버는 이미 기준점 이하로 걸러 내려보낸다. 즉 응답 안의 모든 인물·관계는 **이미 읽은
 * 범위**다. 되감기는 그 안에서 무엇을 보여줄지 고르는 **표시 필터**일 뿐이고, 서버에
 * 다시 묻지 않는다.
 *
 * 그래서 "기준점을 넘어가지 못하게 막는" 코드가 없다. 눈금 자체를 받은 데이터에서
 * 만들기 때문에 **슬라이더의 오른쪽 끝이 곧 현재 진도**이고, 그 너머 눈금은 존재하지
 * 않는다. 초과 여부를 판별하는 코드를 두지 않는다는 절대 규칙 7번이 구조로 지켜진다 —
 * 클라이언트가 아무리 조작해도 보여줄 데이터 자체가 없다.
 *
 * 클라이언트가 기준점을 서버로 보내지도 않는다 (절대 규칙 8번, 3.3절).
 * 퍼센트를 계산하지도 않는다 — 눈금은 서버가 준 페이지 번호 그대로다 (절대 규칙 2번).
 */

/**
 * 관계도가 실제로 달라지는 지점들. 오름차순, 중복 없음.
 *
 * 인물이 등장하거나 관계가 확립된 페이지만 눈금으로 쓴다. 아무 일도 없는 페이지를
 * 눈금에 넣으면 슬라이더를 움직여도 화면이 그대로여서 고장난 것처럼 보인다.
 */
export function graphMilestones(graph: GraphResponse): number[] {
  const pages = new Set<number>();
  for (const node of graph.nodes) pages.add(node.first_appearance_page);
  for (const edge of graph.edges) pages.add(edge.established_page);
  return [...pages].sort((a, b) => a - b);
}

/** `page` 시점까지 드러난 것만 남긴다. 그 뒤 등장하는 인물·관계는 뺀다. */
export function graphUpTo(graph: GraphResponse, page: number): GraphResponse {
  const nodes = graph.nodes.filter((node) => node.first_appearance_page <= page);
  const visible = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    // 양쪽 인물이 모두 드러난 관계만 남긴다 — 한쪽이 없으면 그릴 수 없다
    edges: graph.edges.filter(
      (edge) =>
        edge.established_page <= page && visible.has(edge.source) && visible.has(edge.target)
    ),
  };
}
