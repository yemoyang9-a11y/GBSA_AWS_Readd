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
 * 인물별 **확립 시점 수** — 그 인물의 관계가 서로 다른 몇 개의 페이지에서 확립됐는지.
 *
 * 관계 5개가 전부 40페이지에서 한꺼번에 드러났으면 1, 관계 2개가 10·80페이지에 흩어져
 * 있으면 2다. 정의상 항상 연결 수(degree) 이하이며, 관계가 전부 다른 페이지에 있으면
 * 연결 수와 같아진다 — 즉 **연결 수에서 "같은 장면에 뭉친 만큼"을 깎아낸 값**이다.
 *
 * 이 값은 `filterMajorCharacters`의 순위에만 쓴다. 노드 원 크기·배치는 여전히 실제
 * 연결 수를 쓴다(`RelationshipGraph.tsx`, `graphLayout.ts`) — 관계가 5개인 인물은
 * 화면에서도 5개짜리 크기로 보여야 "관계 5개인데 왜 작지"라는 혼란이 안 생긴다.
 *
 * ⚠️ 여기서 보는 `established_page`는 A6(이력형 관계) 때문에 **그 쌍의 최신 확립 시점**
 *    이다(약혼 22p → 부부 28p면 28p만 내려온다). 그래서 엄밀히는 "관계가 마지막으로
 *    확립·갱신된 시점"을 센다. 대부분의 쌍은 이력이 하나라 차이가 없지만, 여러 관계가
 *    한 장면에서 동시에 *갱신*된 인물은 실제보다 뭉쳐 보일 수 있다.
 */
export function countRelationPages(
  nodes: readonly { id: string }[],
  edges: readonly { source: string; target: string; established_page: number }[]
): Map<string, number> {
  const pages = new Map<string, Set<number>>();
  for (const node of nodes) pages.set(node.id, new Set<number>());

  for (const edge of edges) {
    // 두 id 모두 노드 목록에 있을 때만 센다 — computeDegrees와 같은 방어(유령 id가 실재
    // 노드의 값을 부풀리지 않게 한다).
    if (pages.has(edge.source) && pages.has(edge.target)) {
      pages.get(edge.source)?.add(edge.established_page);
      pages.get(edge.target)?.add(edge.established_page);
    }
  }

  const counts = new Map<string, number>();
  for (const [id, set] of pages) counts.set(id, set.size);
  return counts;
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
 * "주요인물" 표시 필터 — `max(floor, degree가 minDegree 이상인 인원 수)`명만 남긴다.
 *
 * graphUpTo와 같은 성격의 **표시 필터**다: 서버가 이미 컷오프 이하로 걸러 보낸 데이터
 * 안에서 클라이언트가 한 번 더 추리는 것뿐이고, 어느 인물이 기준점을 넘었는지는 판별하지
 * 않는다 — 절대 규칙 7번 대상이 아니다.
 *
 * ## 자리 개수와 순위를 다른 값으로 정한다 (2026-08-26)
 *
 * **몇 명을 남길지**는 예전 그대로 연결 수(degree)로 정한다 — 위 `MAJOR_CHARACTER_FLOOR`
 * 주석의 "뚝 떨어지는 지점이 없다"는 성질이 degree 기준으로 확보된 것이라 건드리지 않는다.
 * **누가 그 자리에 앉을지**만 확립 시점 수(`countRelationPages`)로 정한다.
 *
 * 자리 개수는 "이야기가 지금 얼마나 복잡한지", 앉는 사람은 "누가 중요한지"로 읽으면 된다.
 * 그래서 한 장면에만 뭉친 인물이 자리 하나를 열어놓고 정작 본인은 못 앉는 경우가 생길 수
 * 있는데, 결과적으로 자리가 넉넉해질 뿐이라 해롭지 않다.
 *
 * ## 왜 연결 수 대신 확립 시점 수로 줄을 세우나
 *
 * 연결 수만 쓰면 **한 장면에서 관계가 쏟아진 인물**이 과대평가된다(2026-08-26 사용자 제보 —
 * "연결 관계가 5명씩 되더라도 그 관계가 모두 한 페이지에만 나타나고 그 이후에는 등장하지
 * 않으면 옳지 않은 것 같다"). 가족 모임 한 장면에서 관계 5개를 한꺼번에 얻은 인물과, 여러
 * 장면에 걸쳐 2~3명과 엮이며 계속 나오는 인물이 연결 수로는 전자가 이긴다.
 *
 * 대안으로 "인물 노트가 걸쳐 있는 페이지 수"(서술량)를 보조 신호로 넣는 안을 검토했다가
 * 접었다. 두 가지 이유다 —
 *
 * 1. **신뢰도.** `character_notes`는 내용 기반 중복 제거가 어느 계층에도 없고(파이프라인의
 *    accumulate는 무조건 push, register의 INSERT는 `ON CONFLICT (id)`로 uuid 대리키만 본다),
 *    "장당 인물당 최대 2문장" 상한이 프롬프트 지시일 뿐 코드로 강제되지 않아 검증된 적이
 *    없다. 같은 종류의 프롬프트 상한이 리캡 500자에서 실제로 샜던 전례가 있다.
 * 2. **중복성.** 소설 인물 중요도 연구에서 **이름 언급 횟수와 동시등장 네트워크 중심성의
 *    상관이 ρ=0.89**로 보고된다 — "얼마나 자주 언급되나"와 "얼마나 많이 연결되나"는 대체로
 *    같은 것을 잰다는 뜻이다. 그러면서도 방법 간 주인공 지목 일치율은 75.3%에 그친다. 즉
 *    언급량 신호를 얹어봐야 대부분의 인물에겐 새 정보가 없고 **소수의 어긋나는 경우에만**
 *    의미가 있는데, 그 어긋나는 경우가 정확히 위의 "한 장면에 뭉친 인물"이다.
 *    → 그렇다면 신뢰도 낮은 새 데이터를 가중치로 섞느니, **이미 검증된 관계 데이터만으로**
 *      그 경우를 직접 잡아내는 편이 낫다. 확립 시점 수가 그 역할을 한다.
 *    @see Computational Representations of Character Significance in Novels
 *         https://arxiv.org/html/2601.15508
 *
 * ⚠️ 확립 시점 수는 "등장 횟수"가 아니다. 관계가 여러 시점에 걸쳐 맺어졌는지만 본다 —
 *    꾸준히 등장한다는 사실 자체는 여전히 못 본다. 위 두 상황에서 원하는 결과가 나오는 건
 *    관계 형성 시점이 그 대리 지표 역할을 해주기 때문이지 등장 횟수를 재서가 아니다.
 *    실데이터로 노트 추출 밀도를 확인한 뒤 서술량 신호를 다시 검토할 여지는 남아 있다.
 *
 * ## 동점 처리
 *
 * 확립 시점 수가 같으면 별칭 수가 많은 인물, 그것도 같으면 먼저 등장한 인물이 앞선다.
 * 등장 순서는 그래프가 바뀌어도 변하지 않는 값이라 이 정렬 전체가 결정적이고 매 렌더 같은
 * 결과를 낸다(무작위 없음). 정렬은 등수를 매기는 데만 쓰고, 반환하는 `nodes`는 원본 순서를
 * 그대로 유지한다 — 화면의 카드 나열 순서는 안 바뀌고 목록에 드는 인물만 바뀐다.
 *
 * 두 값 모두 넘겨받은 그래프(되감기로 걸러진 뒤일 수 있다) 안에서 다시 계산한다 — 되감아서
 * 아직 드러나지 않은 관계는 애초에 graph.edges에 없으므로, 과거 시점으로 갈수록 등수·상한
 * 둘 다 그 시점 기준으로 다시 매겨진다(따로 연동할 필요가 없다).
 */
export function filterMajorCharacters(
  graph: GraphResponse,
  floor: number = MAJOR_CHARACTER_FLOOR,
  minDegree: number = MAJOR_CHARACTER_MIN_DEGREE
): GraphResponse {
  // 자리 개수는 연결 수로 (예전 그대로), 순위는 확립 시점 수로 — 위 클래스 주석 참고
  const degree = computeDegrees(graph.nodes, graph.edges);
  const qualifyingCount = graph.nodes.filter((node) => (degree.get(node.id) ?? 0) >= minDegree).length;
  const topN = Math.max(floor, qualifyingCount);

  const relationPages = countRelationPages(graph.nodes, graph.edges);
  const ranked = [...graph.nodes].sort((a, b) => {
    const bySpread = (relationPages.get(b.id) ?? 0) - (relationPages.get(a.id) ?? 0);
    if (bySpread !== 0) return bySpread;

    const byAliases = b.aliases.length - a.aliases.length;
    if (byAliases !== 0) return byAliases;

    return a.first_appearance_page - b.first_appearance_page;
  });
  const visible = new Set(ranked.slice(0, topN).map((node) => node.id));

  return {
    nodes: graph.nodes.filter((node) => visible.has(node.id)),
    edges: graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
  };
}
