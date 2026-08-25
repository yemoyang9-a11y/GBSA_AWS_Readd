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
 * "주요인물" 표시 필터가 남기는 인원 상한.
 *
 * 처음엔 "연결 수(degree) 4 미만은 뺀다"는 고정 임계값이었다(2026-08-25 1차) — 그런데
 * 이 값을 못 넘는 인물이 아직 아무도 없을 때(진도 초반 등) "전체를 대신 보여주는"
 * 폴백을 같이 뒀더니, 딱 첫 번째 인물이 임계값을 넘는 순간 **화면이 "전체 N명"에서
 * "겨우 1~2명"으로 뚝 떨어지는** 문제가 실사용 중 발견됐다(2026-08-25 재보고 — "사람이
 * 많다가 어느 순간 확 줄어드는 현상"). 절대 임계값은 근본적으로 이 문제를 만든다 — 통과
 * 여부가 이분법이라 통과자가 0명에서 1명으로 바뀌는 순간 표시가 "전체"에서 "필터링됨"으로
 * 전환되기 때문이다.
 *
 * 그래서 절대 임계값을 버리고 **"연결 수 상위 N명"** 으로 바꿨다. 인물·관계는 되감기
 * 방향으로만 늘어나므로(그래프가 통째로 다시 줄어드는 일은 없다 — 3.3절) 이 아래
 * 화면에 보이는 인원 수는 항상 `min(N, 그 시점 전체 인물 수)`다 — 전체가 N을 넘기
 * 전까진 "주요인물"과 "전체"가 정확히 같은 인원을 보여주다가, N을 넘는 순간부터 딱
 * N명에서 멈추고 그 뒤로는 구성(누가 상위 N에 드는지)만 서서히 바뀐다. 단계 없이
 * 뚝 떨어지는 지점 자체가 없다.
 */
export const MAJOR_CHARACTER_TOP_N = 8;

/**
 * "주요인물" 표시 필터 — 연결 수(degree) 상위 `topN`명만 남긴다.
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
 * 아직 드러나지 않은 관계는 애초에 graph.edges에 없으므로, 과거 시점으로 갈수록 등수
 * 자체가 그 시점 기준으로 다시 매겨진다(따로 연동할 필요가 없다).
 */
export function filterMajorCharacters(
  graph: GraphResponse,
  topN: number = MAJOR_CHARACTER_TOP_N
): GraphResponse {
  const degree = computeDegrees(graph.nodes, graph.edges);
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
