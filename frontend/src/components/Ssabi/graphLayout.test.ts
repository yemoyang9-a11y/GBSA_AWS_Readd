import { centralNodeIndex, radialLayout } from './graphLayout';

/**
 * 관계도 배치 — 스펙 §6
 *
 * React Flow 가 렌더되지 않는 환경에서도 배치 규칙은 여기서 고정된다.
 */

const node = (id: string, page: number) => ({ id, first_appearance_page: page });
const edge = (source: string, target: string) => ({ source, target });

describe('centralNodeIndex — 가운데에 놓을 인물', () => {
  it('연결이 가장 많은 인물을 고른다', () => {
    const nodes = [node('a', 1), node('b', 2), node('c', 3)];
    // b 가 2개, a·c 가 1개씩
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(centralNodeIndex(nodes, edges)).toBe(1);
  });

  it('연결 수가 같으면 먼저 등장한 인물을 고른다', () => {
    const nodes = [node('late', 9), node('early', 2)];
    const edges = [edge('late', 'early')]; // 둘 다 1개
    expect(centralNodeIndex(nodes, edges)).toBe(1);
  });

  it('간선이 없으면 먼저 등장한 인물을 고른다', () => {
    const nodes = [node('late', 9), node('early', 2)];
    expect(centralNodeIndex(nodes, [])).toBe(1);
  });

  it('노드가 없으면 -1', () => {
    expect(centralNodeIndex([], [])).toBe(-1);
  });

  it('노드에 없는 id 를 가리키는 간선은 세지 않는다', () => {
    const nodes = [node('a', 1), node('b', 2)];
    // 유령 id 가 a 의 연결 수를 부풀리면 안 된다
    const edges = [edge('a', 'ghost'), edge('b', 'a')];
    expect(centralNodeIndex(nodes, edges)).toBe(0); // a 1개, b 1개 → 먼저 등장한 a
  });
});

describe('radialLayout — 중심 1명 + 둘레', () => {
  const center = { x: 0, y: 0 };
  const opts = { radius: 100, center };

  it('노드 개수만큼 좌표를 만들고 순서를 유지한다', () => {
    expect(radialLayout(5, 0, opts)).toHaveLength(5);
    expect(radialLayout(0, 0, opts)).toHaveLength(0);
  });

  it('중심 인물은 정확히 중심에 놓인다', () => {
    const points = radialLayout(4, 2, opts);
    expect(points[2]).toEqual(center);
  });

  it('중심이 아닌 인물은 모두 중심에서 같은 거리에 있다', () => {
    const points = radialLayout(5, 1, opts);
    points.forEach((p, i) => {
      if (i === 1) return;
      expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(100, 5);
    });
  });

  it('첫 둘레 인물은 12시 방향에 놓인다', () => {
    // centerIndex 가 0 이므로 인덱스 1 이 둘레의 첫 자리다
    const points = radialLayout(4, 0, opts);
    expect(points[1].x).toBeCloseTo(0, 5);
    expect(points[1].y).toBeCloseTo(-100, 5);
  });

  it('둘레 인물이 균등 분포한다 — 중심 1 + 둘레 4면 90도 간격', () => {
    const points = radialLayout(5, 0, opts);
    expect(points[2].x).toBeCloseTo(100, 5); // 3시
    expect(points[2].y).toBeCloseTo(0, 5);
    expect(points[3].x).toBeCloseTo(0, 5); // 6시
    expect(points[3].y).toBeCloseTo(100, 5);
  });

  it('노드가 1개면 중심에 놓는다', () => {
    expect(radialLayout(1, 0, opts)).toEqual([center]);
  });

  it('같은 입력에 같은 좌표를 낸다 — 렌더마다 흔들리지 않는다', () => {
    expect(radialLayout(5, 2)).toEqual(radialLayout(5, 2));
  });

  it('마주 보는 간선의 중점이 겹치지 않는다 — 라벨이 서로를 가리던 문제', () => {
    // 중심 0 과 둘레 3명. 중심에서 뻗는 간선들의 중점은 서로 다른 지점이다
    const [c, a, b] = radialLayout(4, 0, opts);
    const midA = { x: (c.x + a.x) / 2, y: (c.y + a.y) / 2 };
    const midB = { x: (c.x + b.x) / 2, y: (c.y + b.y) / 2 };
    expect(midA).not.toEqual(midB);
  });
});
