import type { GraphResponse } from '../../types';
import { computeDegrees } from './graphLayout';

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

/**
 * "주요인물" 표시 필터에 쓰는 기본 임계값 — 연결 수(degree)가 이 값 미만이면 걷어낸다.
 *
 * mock 데이터(30명 규모, 2026-08-25 시안 검토)로 확인한 값이다: 4 미만은 대부분
 * 화면 채우기용 엑스트라였지만, 고참봉·김할머니처럼 엑스트라끼리를 잇는 "허브"라
 * degree만 4가 되는 예외도 실측으로 나왔다 — degree는 근사치일 뿐 정확한 지표는
 * 아니다. 실제 시드 데이터로 다시 확인 후 값을 조정할 수 있다.
 */
export const MAJOR_CHARACTER_MIN_DEGREE = 4;

/**
 * "주요인물" 표시 필터 — 연결 수가 임계값 미만인 인물을 뺀다.
 *
 * graphUpTo와 같은 성격의 **표시 필터**다: 서버가 이미 컷오프 이하로 걸러 보낸 데이터
 * 안에서 클라이언트가 한 번 더 추리는 것뿐이고, 어느 인물이 기준점을 넘었는지는 판별하지
 * 않는다 — 절대 규칙 7번 대상이 아니다.
 *
 * degree는 넘겨받은 그래프(되감기로 걸러진 뒤일 수 있다) 안에서 다시 계산한다 —
 * 되감아서 아직 드러나지 않은 관계는 애초에 graph.edges에 없으므로, 과거 시점으로
 * 갈수록 자연히 임계값을 넘는 인물이 줄어든다(따로 연동할 필요가 없다).
 */
export function filterMajorCharacters(
  graph: GraphResponse,
  minDegree: number = MAJOR_CHARACTER_MIN_DEGREE
): GraphResponse {
  const degree = computeDegrees(graph.nodes, graph.edges);
  const nodes = graph.nodes.filter((node) => (degree.get(node.id) ?? 0) >= minDegree);
  const visible = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
  };
}
