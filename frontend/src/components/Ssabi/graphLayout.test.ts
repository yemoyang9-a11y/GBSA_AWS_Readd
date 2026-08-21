import { circularLayout } from './graphLayout';

/**
 * 관계도 배치 — 스펙 §6
 *
 * React Flow 가 jsdom 에서 렌더되지 않아도 배치 규칙은 여기서 고정된다.
 */
describe('circularLayout', () => {
  it('노드 개수만큼 좌표를 만든다', () => {
    expect(circularLayout(5)).toHaveLength(5);
    expect(circularLayout(0)).toHaveLength(0);
  });

  it('첫 노드는 12시 방향에 놓인다', () => {
    const [first] = circularLayout(4, { radius: 100, center: { x: 0, y: 0 } });
    expect(first.x).toBeCloseTo(0, 5);
    expect(first.y).toBeCloseTo(-100, 5);
  });

  it('노드가 원주에 균등 분포한다 — 4개면 90도 간격', () => {
    const points = circularLayout(4, { radius: 100, center: { x: 0, y: 0 } });
    expect(points[1].x).toBeCloseTo(100, 5); // 3시
    expect(points[1].y).toBeCloseTo(0, 5);
    expect(points[2].x).toBeCloseTo(0, 5); // 6시
    expect(points[2].y).toBeCloseTo(100, 5);
  });

  it('모든 노드가 중심에서 같은 거리에 있다', () => {
    const center = { x: 200, y: 150 };
    for (const p of circularLayout(7, { radius: 120, center })) {
      const d = Math.hypot(p.x - center.x, p.y - center.y);
      expect(d).toBeCloseTo(120, 5);
    }
  });

  it('노드가 1개면 중심에 놓는다 — 원주에 혼자 두면 한쪽으로 치우친다', () => {
    const [only] = circularLayout(1, { radius: 100, center: { x: 50, y: 50 } });
    expect(only).toEqual({ x: 50, y: 50 });
  });

  it('같은 입력에 같은 좌표를 낸다 — 렌더마다 흔들리지 않는다', () => {
    expect(circularLayout(5)).toEqual(circularLayout(5));
  });
});
