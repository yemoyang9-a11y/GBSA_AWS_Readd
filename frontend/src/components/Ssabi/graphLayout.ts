/**
 * 관계도 배치 — 지도형 리디자인 (2026-08-24, HTML 시안 `reader-map-graph.html` 구조 반영)
 *
 * 기존 방사형(중심 1명 + 원주) 배치를 힘-분산(force-directed) 배치로 바꾼다. 인물 수가
 * 많아지면(「탁류」 100p 시점 기준 인물 30·간선 51) 방사형은 중심 근처가 지나치게
 * 빽빽해졌다 — 시안은 줌/팬이 가능한 지도형이라 촘촘한 군집도 펼쳐볼 수 있다는 전제로
 * 좌표를 자연스럽게 흩어 놓는다.
 *
 * 무작위성을 쓰지 않는다 — 초기 배치를 노드 순서 기반 원형으로 고정하고, 반발·인력
 * 갱신도 전부 현재 좌표의 결정적 함수라 **같은 입력엔 항상 같은 좌표**를 낸다(이전
 * radialLayout의 요구사항을 그대로 유지).
 *
 * DOM 없이 검증할 수 있도록 순수 함수로 분리했다.
 */

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 힘-분산 배치가 도는 좌표 공간의 한 변. 실제 화면 크기와는 무관하다 — 컴포넌트가 이 좌표를
 *  자신의 viewBox 로 옮겨 그린다. */
const CANVAS_SIZE = 640;

/** forceLayout이 노드를 이 반경(중심 기준) 밖으로 내보내지 않는다. */
const LAYOUT_RADIUS = CANVAS_SIZE * 0.42;

/**
 * 인물별 연결 수(간선 수). 노드에 없는 id 를 가리키는 간선은 세지 않는다 — 유령 id 가
 * 연결 수를 부풀리면 안 된다.
 */
export function computeDegrees(
  nodes: readonly { id: string }[],
  edges: readonly { source: string; target: string }[]
): Map<string, number> {
  const degree = new Map<string, number>();
  for (const node of nodes) degree.set(node.id, 0);
  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

/**
 * 가운데(기본 포커스)에 놓을 인물의 인덱스 — **연결이 가장 많은 인물, 동점이면 먼저 등장한
 * 쪽**. 초기 화면 포커스와 되감기 슬라이더가 없을 때의 기본 강조에 쓴다.
 *
 * ⚠️ 계약에 "주인공" 필드가 없어 데이터에서 추론한다. 지어낸 정보를 화면에 쓰는 게 아니라
 *    이미 있는 값(간선 수·최초 등장)으로 고를 뿐이다.
 */
export function centralNodeIndex(
  nodes: readonly { id: string; first_appearance_page: number }[],
  edges: readonly { source: string; target: string }[]
): number {
  if (nodes.length === 0) return -1;

  const degree = computeDegrees(nodes, edges);
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

const MIN_RADIUS = 14;
const MAX_RADIUS = 26;
const RADIUS_STEP = 2.4;

/** 연결 수가 많을수록 큰 원 — 상한을 둔다(주인공이라고 화면을 절반 잡아먹지 않는다). */
export function nodeRadius(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + RADIUS_STEP * Math.max(0, degree - 1));
}

function seedPositions(count: number): Point[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 }];

  const radius = CANVAS_SIZE * 0.32;
  const center = CANVAS_SIZE / 2;
  return Array.from({ length: count }, (_, i) => {
    const theta = (2 * Math.PI * i) / count - Math.PI / 2;
    return { x: center + radius * Math.cos(theta), y: center + radius * Math.sin(theta) };
  });
}

export interface ForceLayoutOptions {
  /** 반복 횟수 — 늘리면 더 안정된 배치가 나오지만 계산량이 늘어난다 */
  iterations?: number;
}

const DEFAULT_ITERATIONS = 220;

/**
 * Fruchterman–Reingold 스타일 힘-분산 배치.
 *
 * 반환 배열의 순서는 입력 노드 순서와 같다 — 호출부가 인덱스로 짝지을 수 있어야 한다.
 */
export function forceLayout(
  nodes: readonly { id: string }[],
  edges: readonly { source: string; target: string }[],
  options: ForceLayoutOptions = {}
): Point[] {
  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 }];

  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const indexOf = new Map(nodes.map((node, i) => [node.id, i]));
  const pairs: { a: number; b: number }[] = [];
  for (const edge of edges) {
    const a = indexOf.get(edge.source);
    const b = indexOf.get(edge.target);
    if (a !== undefined && b !== undefined && a !== b) pairs.push({ a, b });
  }

  const k = Math.sqrt((CANVAS_SIZE * CANVAS_SIZE) / n); // 이상적인 간선 길이
  const points = seedPositions(n);
  let temperature = CANVAS_SIZE / 10;
  const cooling = temperature / iterations;

  for (let iter = 0; iter < iterations; iter += 1) {
    const dx = new Array(n).fill(0);
    const dy = new Array(n).fill(0);

    // 반발력 — 모든 쌍이 서로 밀어낸다
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let ddx = points[i].x - points[j].x;
        let ddy = points[i].y - points[j].y;
        let dist = Math.hypot(ddx, ddy);
        if (dist < 0.01) {
          // 정확히 겹치는 경우 — 인덱스 차이로 결정적으로 벌린다(무작위 없음)
          ddx = 0.01 * (i - j || 1);
          ddy = 0.01;
          dist = Math.hypot(ddx, ddy);
        }
        const force = (k * k) / dist;
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        dx[i] += fx;
        dy[i] += fy;
        dx[j] -= fx;
        dy[j] -= fy;
      }
    }

    // 인력 — 간선으로 이어진 쌍만 서로 당긴다
    for (const { a, b } of pairs) {
      let ddx = points[a].x - points[b].x;
      let ddy = points[a].y - points[b].y;
      let dist = Math.hypot(ddx, ddy);
      if (dist < 0.01) dist = 0.01;
      const force = (dist * dist) / k;
      const fx = (ddx / dist) * force;
      const fy = (ddy / dist) * force;
      dx[a] -= fx;
      dy[a] -= fy;
      dx[b] += fx;
      dy[b] += fy;
    }

    // 한 스텝에서 움직일 수 있는 최대 거리(temperature)로 변위를 제한 후 적용
    for (let i = 0; i < n; i += 1) {
      const disp = Math.hypot(dx[i], dy[i]);
      if (disp > 0.01) {
        const capped = Math.min(disp, temperature);
        points[i].x += (dx[i] / disp) * capped;
        points[i].y += (dy[i] / disp) * capped;
      }
      // 캔버스 밖으로 못 나가게 원형 경계에 붙잡아 둔다. 반발력만 있고 간선(인력)이
      // 없는 인물 쌍은 이 경계가 없으면 서로를 계속 밀어내기만 해서 몇 천 단위까지
      // 벌어진다 — 그러면 노드 수가 조금만 바뀌어도 배치 전체 크기가 요동쳐,
      // 고정 크기인 노드·글자가 매번 다른 비율로 보였다(실기기 확인, 2026-08-24).
      const cdx = points[i].x - CANVAS_SIZE / 2;
      const cdy = points[i].y - CANVAS_SIZE / 2;
      const cdist = Math.hypot(cdx, cdy);
      if (cdist > LAYOUT_RADIUS) {
        const scale = LAYOUT_RADIUS / cdist;
        points[i].x = CANVAS_SIZE / 2 + cdx * scale;
        points[i].y = CANVAS_SIZE / 2 + cdy * scale;
      }
    }
    temperature = Math.max(0, temperature - cooling);
  }

  return points;
}

/** 인물이 1~2명뿐일 때도 뷰박스가 너무 좁아지지 않게 두는 하한선. */
const MIN_BOX_SIZE = CANVAS_SIZE * 0.5;

/**
 * 배치 결과를 감싸는 사각형 — viewBox 초기값(fit) 계산용.
 *
 * 하한선(MIN_BOX_SIZE)을 둔다 — 안 그러면 인물이 1~2명일 때 점 주위 패딩만큼만
 * 뷰박스가 잡혀서, 크기가 고정값인 노드·글자가 실제보다 훨씬 크게 보였다(실기기
 * 확인, 2026-08-24). forceLayout의 LAYOUT_RADIUS 경계와 함께, 인물 수와 무관하게
 * 뷰박스 크기가 대략 일정한 범위(MIN_BOX_SIZE ~ 캔버스 전체)를 유지하게 한다.
 */
export function boundingBox(points: readonly Point[], padding = 48): BoundingBox {
  if (points.length === 0) return { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let minX = Math.min(...xs) - padding;
  let minY = Math.min(...ys) - padding;
  let maxX = Math.max(...xs) + padding;
  let maxY = Math.max(...ys) + padding;

  if (maxX - minX < MIN_BOX_SIZE) {
    const cx = (minX + maxX) / 2;
    minX = cx - MIN_BOX_SIZE / 2;
    maxX = cx + MIN_BOX_SIZE / 2;
  }
  if (maxY - minY < MIN_BOX_SIZE) {
    const cy = (minY + maxY) / 2;
    minY = cy - MIN_BOX_SIZE / 2;
    maxY = cy + MIN_BOX_SIZE / 2;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 클수록 겹칠 때 우선 유지된다 */
  priority: number;
}

/** 한 글자를 이 너비(사용자 좌표 단위)로 어림한다 — 실제 폰트 측정 없이 결정적으로 계산 */
export function estimateTextWidth(text: string, charWidth: number): number {
  return text.length * charWidth;
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

/**
 * 겹치는 라벨 중 우선순위가 낮은 쪽을 뺀다. 인물명·관계 라벨 둘 다 이 규칙 하나로
 * 처리한다 — "먼저 그린 라벨이 이긴다"가 아니라 "중요한 라벨이 이긴다".
 */
export function pickNonOverlapping<T extends LabelBox>(boxes: readonly T[]): T[] {
  const sorted = [...boxes].sort((a, b) => b.priority - a.priority);
  const kept: T[] = [];
  for (const box of sorted) {
    if (!kept.some((k) => boxesOverlap(box, k))) kept.push(box);
  }
  return kept;
}
