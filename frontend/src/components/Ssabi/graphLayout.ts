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

/**
 * forceLayout이 노드를 이 반경(중심 기준) 밖으로 내보내지 않는 **안전망**. 평소엔
 * 아래 중력(GRAVITY_STRENGTH)이 배치를 붙잡고, 이건 병적으로 큰 입력에서만 걸린다.
 *
 * 실데이터(인물 20~30명 규모)에서 이 값을 컴팩트하게(예 0.42) 잡았더니, 반발력만 있고
 * 서로 당기는 간선이 없는 다수의 인물이 매 반복마다 경계에서 튕겨 나와 **정확히 같은
 * 반경에 줄지어 서는 도넛 모양**이 됐다(2026-08-25 사용자 제보 — "원형 주위에 빙 둘러져
 * 있다"). 하드 클램프는 노드 수와 무관하게 반경이 고정이라 인물이 늘수록 그 원 위에
 * 더 많은 노드가 밀집한다. 지도처럼 줌/팬이 가능해진 뒤로는 첫 화면에 전부 욱여넣을
 * 필요가 없어, 안전망 반경을 넉넉히 키우고 실제 형태는 중력에 맡긴다.
 */
const LAYOUT_RADIUS = CANVAS_SIZE * 1.6;

/**
 * 중심으로 끌어당기는 약한 중력 — 매 반복마다 거리에 비례해 적용한다(2026-08-25).
 * 반발력만 있는 무관계 노드 군집이 무한히 퍼지는 걸 막는 게 목적이고, 위 하드 클램프처럼
 * "이 선을 넘으면 즉시 튕겨낸다"가 아니라 매 스텝 조금씩 당기기만 해서 특정 반경에
 * 노드가 줄지어 서는 인공적인 형태(도넛)를 만들지 않는다. 노드가 많을수록 반발력 총합이
 * 커져 자연히 더 넓게 퍼지고, 중력과 만나는 지점에서 균형을 이룬다 — 인물 수에 맞춰 손으로
 * 반경 공식을 다시 잡을 필요가 없다.
 *
 * 2026-08-25 — 1.5는 여전히 너무 촘촘하다는 피드백("아직도 겹치는 부분이 많다")으로
 * 0.8로 낮춰 전체적으로 더 넓게 퍼지게 한다. 참고 시안(reader-map-graph.html)도 실제
 * 렌더 크기 대비 노드 사이 거리가 훨씬 여유로웠다 — 화면이 줌/팬 가능하니 첫 화면에
 * 다 담기는 것보다 안 겹치는 쪽을 우선한다.
 *
 * 2026-08-25 (2차) — 실데이터(인물 35·간선 54, 여러 인물이 얽힌 핵심 인물군)로 확인:
 * 원 자체는 이미 안 겹치지만(최소 간격 120유닛 이상) 핵심 인물군이 서로 촘촘히 얽혀
 * 있어 선이 몰려 빽빽해 보인다는 피드백("선이 겹치고 좀 빽빽해 보인다") — 0.8→0.5로
 * 한 단계 더 낮춰 여유를 늘린다.
 */
const GRAVITY_STRENGTH = 0.5;

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
    // 두 id 모두 노드 목록에 있을 때만 센다 — 한쪽이 유령 id면 그 간선 자체를 없는 것으로
    // 취급한다. 반대쪽만이라도 세면 유령 id 가 실재 노드의 연결 수를 부풀린다.
    if (degree.has(edge.source) && degree.has(edge.target)) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
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

/**
 * 2026-08-25 — 처음엔 범위를 좁혔더니(16~20) 이번엔 "차이가 더 나도 된다"는 반대
 * 피드백. 겹침은 nodeRadius 범위가 아니라 전체 배치 여유(중력·겹침 제거 패스)로
 * 해결하는 쪽으로 방향을 바꿔서, 크기 차이는 원래보다 더 크게 되돌린다.
 *
 * 2026-08-25 (2차) — 화면상 크기를 100% 기준으로 고정(RelationshipGraph.tsx의
 * nodeScale)한 뒤로 "노드가 전반적으로 작아 보여서 크기 비교가 어렵고 글씨만 혼자
 * 떠다니는 느낌"이라는 피드백. 전체적으로 한 단계 키운다.
 */
const MIN_RADIUS = 17;
const MAX_RADIUS = 32;
const RADIUS_STEP = 2.2;

/** 연결 수가 많을수록 큰 원 — 상한을 둔다(주인공이라고 화면을 절반 잡아먹지 않는다). */
export function nodeRadius(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + RADIUS_STEP * Math.max(0, degree - 1));
}

/**
 * 초기 각도를 0(오른쪽)에서 시작한다 — 예전엔 -π/2(위쪽)에서 시작해서, 인물이 2명뿐일
 * 때 정확히 위/아래로 마주 서는 배치가 나왔다(2026-08-25 피드백: "위·아래 끝에
 * 있는 게 별로다, 가깝게 수평으로"). 2명일 땐 서로 밀어내는 힘·당기는 힘이 모두
 * 시작 축을 따라서만 작용해 회전할 방법이 없으므로(회전시킬 토크가 없다), 이 시작
 * 각도가 그대로 최종 배치의 축이 된다 — 0에서 시작하면 그 축이 수평이 된다.
 */
function seedPositions(count: number): Point[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 }];

  const radius = CANVAS_SIZE * 0.32;
  const center = CANVAS_SIZE / 2;
  return Array.from({ length: count }, (_, i) => {
    const theta = (2 * Math.PI * i) / count;
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

  // 이상적인 간선 길이. n이 아주 작으면(1/sqrt(n)) k가 지나치게 커져 반발력이 과해진다 —
  // 인물 2명이 정확히 좌우 양 끝(약 710 떨어짐, 캔버스는 640)까지 밀려나던 원인이었다
  // (2026-08-25, "범위를 넓혀야 할 것 같아, 아직도 양 끝에 있어"). n을 최소 K_FLOOR로
  // 내려 계산해 작은 그래프에서도 k가 적당한 범위에 머물게 한다 — K_FLOOR 이상인
  // 그래프(대부분의 실사용 규모)는 이 바닥값의 영향을 받지 않는다.
  const K_FLOOR = 15;
  const k = Math.sqrt((CANVAS_SIZE * CANVAS_SIZE) / Math.max(n, K_FLOOR)); // 이상적인 간선 길이
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

    // 인력 — 간선으로 이어진 쌍만 서로 당긴다.
    // 2026-08-25 — 고전 Fruchterman-Reingold는 인력이 거리의 제곱(dist²/k)이라, 간선이
    // 많은 인물(허브) 하나에 여러 인물이 물려 있으면 멀어질수록 인력이 급격히 커져서
    // 전부 허브 바로 옆 좁은 반지름 안으로 되돌아온다 — 허브 하나에 매달린 인물이
    // 많을수록 그 반지름 위가 더 빽빽해진다("아직도 겹치는 부분이 많다" 피드백의
    // 실제 원인). 거리에 비례하는(dist/k) 스프링형 인력으로 바꾸면 같은 간선이라도
    // 멀어질 때 당기는 힘이 완만하게만 커져, 반발력이 이긴 만큼 더 퍼질 수 있다.
    for (const { a, b } of pairs) {
      const ddx = points[a].x - points[b].x;
      const ddy = points[a].y - points[b].y;
      let dist = Math.hypot(ddx, ddy);
      if (dist < 0.01) dist = 0.01;
      const force = dist / k;
      const fx = (ddx / dist) * force;
      const fy = (ddy / dist) * force;
      dx[a] -= fx;
      dy[a] -= fy;
      dx[b] += fx;
      dy[b] += fy;
    }

    // 중력 — 거리에 비례해 중심으로 약하게 당긴다(하드 클램프 대신, 위 GRAVITY_STRENGTH 설명 참고)
    for (let i = 0; i < n; i += 1) {
      dx[i] += (CANVAS_SIZE / 2 - points[i].x) * GRAVITY_STRENGTH;
      dy[i] += (CANVAS_SIZE / 2 - points[i].y) * GRAVITY_STRENGTH;
    }

    // 한 스텝에서 움직일 수 있는 최대 거리(temperature)로 변위를 제한 후 적용
    for (let i = 0; i < n; i += 1) {
      const disp = Math.hypot(dx[i], dy[i]);
      if (disp > 0.01) {
        const capped = Math.min(disp, temperature);
        points[i].x += (dx[i] / disp) * capped;
        points[i].y += (dy[i] / disp) * capped;
      }
      // 병적으로 큰 입력에서만 걸리는 안전망 — 평소엔 위 중력이 배치를 붙잡는다(LAYOUT_RADIUS 설명 참고)
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

  // 겹침 제거 후처리 (2026-08-25) — 위 힘-분산은 노드를 점으로만 다뤄서, 실제 렌더
  // 반경이 큰(연결 수 많은) 노드들이 서로의 "이상적인 거리" 안에서도 원끼리는 겹칠 수
  // 있었다("여전히 겹치는 노드가 많다" 피드백). 실제 반경 합만큼 떨어지도록 직접
  // 밀어내는 별도 패스로 마무리한다 — 전체 구조(중력·간선 인력)는 이미 자리를 잡은
  // 뒤라 이 패스는 국소적인 미세 조정만 한다.
  const degree = computeDegrees(nodes, edges);
  const radii = nodes.map((node) => nodeRadius(degree.get(node.id) ?? 0));
  resolveOverlaps(points, radii);

  return points;
}

/** 2026-08-25 — 6은 원끼리만 겨우 안 닿는 정도라 이름 라벨이 바로 아래에서 서로
 *  붙었다. 라벨이 들어갈 자리까지 감안해 여유를 늘린다. */
const OVERLAP_PADDING = 16;
const OVERLAP_ITERATIONS = 120;

/** 원끼리 반경 합(+여유)보다 가까우면 그만큼 서로 밀어낸다 — 결정적, 무작위 없음. */
function resolveOverlaps(points: Point[], radii: number[]): void {
  const n = points.length;
  for (let iter = 0; iter < OVERLAP_ITERATIONS; iter += 1) {
    let anyOverlap = false;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const minDist = radii[i] + radii[j] + OVERLAP_PADDING;
        let ddx = points[i].x - points[j].x;
        let ddy = points[i].y - points[j].y;
        let dist = Math.hypot(ddx, ddy);
        if (dist < 0.01) {
          ddx = 0.01 * (i - j || 1);
          ddy = 0.01;
          dist = Math.hypot(ddx, ddy);
        }
        if (dist < minDist) {
          anyOverlap = true;
          const push = (minDist - dist) / 2;
          const ux = ddx / dist;
          const uy = ddy / dist;
          points[i].x += ux * push;
          points[i].y += uy * push;
          points[j].x -= ux * push;
          points[j].y -= uy * push;
        }
      }
    }
    if (!anyOverlap) break;
  }
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
export function boundingBox(points: readonly Point[], padding = 70): BoundingBox {
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
