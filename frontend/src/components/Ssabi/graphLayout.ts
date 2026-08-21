/**
 * 관계도 원형 배치 — 스펙 §6
 *
 * React Flow 는 노드 좌표를 요구한다. dagre·elkjs 같은 레이아웃 라이브러리를 추가하지 않고
 * 원주에 균등 분포시킨다 — 인물 5명 규모에서 시안과 유사한 방사형이 나오고, 새 의존성이 없다.
 *
 * 같은 입력에 항상 같은 좌표를 낸다. 렌더마다 노드가 튀면 사용자가 관계를 추적할 수 없다.
 *
 * DOM 없이 검증할 수 있도록 순수 함수로 분리했다 — React Flow 가 jsdom 에서 크기를 0으로
 * 잡아도 배치 규칙 자체는 테스트로 고정된다.
 */

export interface Point {
  x: number;
  y: number;
}

const DEFAULT_RADIUS = 110;
const DEFAULT_CENTER: Point = { x: 180, y: 140 };

export function circularLayout(
  count: number,
  options: { radius?: number; center?: Point } = {}
): Point[] {
  const radius = options.radius ?? DEFAULT_RADIUS;
  const center = options.center ?? DEFAULT_CENTER;

  if (count <= 0) return [];
  // 노드가 하나뿐이면 원주에 두지 않는다 — 혼자 12시에 붙어 화면이 치우친다
  if (count === 1) return [{ ...center }];

  return Array.from({ length: count }, (_, i) => {
    const theta = (2 * Math.PI * i) / count - Math.PI / 2; // 12시에서 시작
    return {
      x: center.x + radius * Math.cos(theta),
      y: center.y + radius * Math.sin(theta),
    };
  });
}
