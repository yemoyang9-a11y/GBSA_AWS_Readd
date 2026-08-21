/**
 * 관계도 방사형 배치 — 스펙 §6
 *
 * React Flow 는 노드 좌표를 요구한다. dagre·elkjs 같은 레이아웃 라이브러리를 추가하지 않고
 * **중심 인물 1명 + 나머지를 원주에** 직접 계산해 배치한다.
 *
 * 원주에만 늘어놓는 방식(원형 배치)을 먼저 썼다가 바꿨다. 짝수 명일 때 마주 보는 쌍이
 * 생기고, 그 두 간선이 모두 원의 중심을 지나 **중점이 정확히 겹친다.** React Flow 는 간선
 * 라벨을 중점에 놓으므로 라벨 하나가 다른 하나에 가려 사라졌다(실제로 데모 데이터에서 발생).
 * 중심에 인물을 두면 간선 대부분이 중심에서 뻗어 나가 중점이 흩어진다.
 *
 * 같은 입력에 항상 같은 좌표를 낸다. 렌더마다 노드가 튀면 사용자가 관계를 추적할 수 없다.
 *
 * DOM 없이 검증할 수 있도록 순수 함수로 분리했다 — React Flow 가 어떤 환경에서 못 뜨더라도
 * 배치 규칙 자체는 테스트로 고정된다.
 */

export interface Point {
  x: number;
  y: number;
}

const DEFAULT_RADIUS = 110;
const DEFAULT_CENTER: Point = { x: 180, y: 140 };

/**
 * 간선 라벨을 캔버스에 그릴 상한 (polish, 2026-08-21).
 *
 * 실 데이터(「탁류」 100p 시점, 인물 30·간선 51)로 실측하니 중심 인물에서 뻗는 간선 라벨이
 * 원 중심 근처에서 서로 겹쳐 읽을 수 없는 글자 뭉치가 됐다(위 방사형 배치 설명의 "중점이
 * 흩어진다"는 짝을 이룬 두 간선끼리는 맞지만, 스포크가 20개가 넘으면 흩어진 자리끼리도
 * 다시 빽빽해진다). 이 값을 넘으면 간선은 선으로만 그리고, 라벨은 관계 목록에서 텍스트로
 * 확인한다 — 정보를 숨기는 게 아니라 이미 있는 텍스트 표시 수단(NFR-USE-006)으로 옮기는
 * 것뿐이다.
 */
export const EDGE_LABEL_LIMIT = 15;

export function shouldShowEdgeLabels(edgeCount: number): boolean {
  return edgeCount <= EDGE_LABEL_LIMIT;
}

/** 원주에 n 개를 균등 분포시킨다. 12시에서 시작해 시계 방향 */
function ringPoints(n: number, radius: number, center: Point): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const theta = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      x: center.x + radius * Math.cos(theta),
      y: center.y + radius * Math.sin(theta),
    };
  });
}

/**
 * 가운데에 놓을 인물의 인덱스를 고른다 — **연결이 가장 많은 인물, 동점이면 먼저 등장한 쪽**.
 *
 * ⚠️ 계약에 "주인공" 필드가 없어 데이터에서 추론한다. 지어낸 정보를 화면에 쓰는 게 아니라
 *    이미 있는 값(간선 수·최초 등장)으로 배치 순서를 정할 뿐이다. 나중에 계약이 주인공을
 *    표시해 주면 그 값을 그대로 쓰도록 바꾼다.
 */
export function centralNodeIndex(
  nodes: readonly { id: string; first_appearance_page: number }[],
  edges: readonly { source: string; target: string }[]
): number {
  if (nodes.length === 0) return -1;

  const degree = new Map<string, number>();
  for (const node of nodes) degree.set(node.id, 0);
  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  let best = 0;
  for (let i = 1; i < nodes.length; i += 1) {
    const here = degree.get(nodes[i].id) ?? 0;
    const bestSoFar = degree.get(nodes[best].id) ?? 0;

    if (here > bestSoFar) best = i;
    else if (
      here === bestSoFar &&
      nodes[i].first_appearance_page < nodes[best].first_appearance_page
    ) {
      best = i;
    }
  }
  return best;
}

/**
 * `centerIndex` 인물은 중심에, 나머지는 그 둘레에 균등 분포시킨다.
 * 반환 배열의 순서는 입력 노드 순서와 같다 — 호출부가 인덱스로 짝지을 수 있어야 한다.
 */
export function radialLayout(
  count: number,
  centerIndex: number,
  options: { radius?: number; center?: Point } = {}
): Point[] {
  const radius = options.radius ?? DEFAULT_RADIUS;
  const center = options.center ?? DEFAULT_CENTER;

  if (count <= 0) return [];
  if (count === 1) return [{ ...center }];

  const ring = ringPoints(count - 1, radius, center);
  const positions: Point[] = [];
  let next = 0;

  for (let i = 0; i < count; i += 1) {
    if (i === centerIndex) positions.push({ ...center });
    else {
      positions.push(ring[next]);
      next += 1;
    }
  }
  return positions;
}
