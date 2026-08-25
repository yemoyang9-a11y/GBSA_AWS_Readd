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
 * "주요인물" 표시 필터가 최소한 보장하는 인원 — 이 아래로는 안 줄어든다.
 *
 * 1차 구현("연결 수(degree) 4 미만은 뺀다"는 절대 임계값)은, 아무도 그 값을 못 넘을 때
 * 전체를 대신 보여주는 폴백을 같이 뒀더니 **첫 인물이 임계값을 넘는 순간 "전체"에서
 * "1~2명"으로 뚝 떨어지는** 문제가 있었다(2026-08-25 1차 보고 — "사람이 많다가 어느
 * 순간 확 줄어드는 현상"). 2차로 절대 임계값을 버리고 "연결 수 상위 N명"만 쓰자 이번엔
 * 반대 문제가 나왔다 — 나중에 중요 인물이 이 N명보다 많아지는 시점에도 무조건 N에서
 * 잘렸다(2026-08-25 2차 보고 — "중요한 인물이 8명 이상인 경우도 많을 텐데").
 *
 * 그래서 두 방식을 **최솟값·최댓값이 아니라 최소 보장선으로** 섞는다(아래 `filterMajorCharacters`
 * 참고). `MAJOR_CHARACTER_MIN_DEGREE`(4) 이상인 인물은 몇 명이든 전부 남기고, 그 인원이
 * 이 값보다 적을 때만 상위 N명이 되도록 채운다 — 즉 실제 상한은 `max(FLOOR, degree
 * 4 이상인 인원 수)`다. degree 4 이상인 인물은 정의상 항상 상위 등수에 있으므로(그 아래
 * 등수는 전부 degree 4 미만이다) 이 둘을 섞어도 새로운 "뚝 떨어지는" 지점이 생기지
 * 않는다 — 인원이 늘 때 상한도 같이 매끄럽게 늘 뿐이다.
 */
export const MAJOR_CHARACTER_FLOOR = 8;

/**
 * "주요인물" 무조건 포함 기준 — 연결 수(degree)가 이 값 이상이면 상한(`MAJOR_CHARACTER_FLOOR`)
 * 을 넘어서도 절대 잘리지 않는다. 위 `MAJOR_CHARACTER_FLOOR` 주석 참고.
 */
export const MAJOR_CHARACTER_MIN_DEGREE = 4;

/**
 * "주요인물" 표시 필터 — 연결 수(degree) 상위 `max(floor, minDegree 이상인 인원 수)`명만
 * 남긴다.
 *
 * graphUpTo와 같은 성격의 **표시 필터**다: 서버가 이미 컷오프 이하로 걸러 보낸 데이터
 * 안에서 클라이언트가 한 번 더 추리는 것뿐이고, 어느 인물이 기준점을 넘었는지는 판별하지
 * 않는다 — 절대 규칙 7번 대상이 아니다.
 *
 * 동점(같은 degree)이면 먼저 등장한 인물을 우선한다 — 등장 순서는 그래프가 바뀌어도
 * 변하지 않는 값이라, 이 정렬 자체는 결정적이고 매 렌더 같은 결과를 낸다(무작위 없음).
 * 정렬은 등수를 매기는 데만 쓰고, 반환하는 `nodes`는 원본 순서를 그대로 유지한다.
 *
 * degree는 넘겨받은 그래프(되감기로 걸러진 뒤일 수 있다) 안에서 다시 계산한다 — 되감아서
 * 아직 드러나지 않은 관계는 애초에 graph.edges에 없으므로, 과거 시점으로 갈수록 등수·
 * 상한 둘 다 그 시점 기준으로 다시 매겨진다(따로 연동할 필요가 없다).
 */
export function filterMajorCharacters(
  graph: GraphResponse,
  floor: number = MAJOR_CHARACTER_FLOOR,
  minDegree: number = MAJOR_CHARACTER_MIN_DEGREE
): GraphResponse {
  const degree = computeDegrees(graph.nodes, graph.edges);
  const qualifyingCount = graph.nodes.filter((node) => (degree.get(node.id) ?? 0) >= minDegree).length;
  const topN = Math.max(floor, qualifyingCount);

  const ranked = [...graph.nodes].sort((a, b) => {
    const diff = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.first_appearance_page - b.first_appearance_page;
  });
  const visible = new Set(ranked.slice(0, topN).map((node) => node.id));

  return {
    nodes: graph.nodes.filter((node) => visible.has(node.id)),
    edges: graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
  };
}
