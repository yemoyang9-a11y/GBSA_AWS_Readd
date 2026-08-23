import {
  boundingBox,
  centralNodeIndex,
  computeDegrees,
  estimateTextWidth,
  forceLayout,
  nodeRadius,
  pickNonOverlapping,
} from './graphLayout';

/**
 * 관계도 배치 — 지도형 리디자인 (2026-08-24)
 *
 * SVG 렌더가 안 되는 환경에서도 배치·크기·라벨 충돌회피 규칙은 여기서 고정된다.
 */

const node = (id: string, page: number) => ({ id, first_appearance_page: page });
const edge = (source: string, target: string) => ({ source, target });

describe('computeDegrees — 연결 수', () => {
  it('간선 수만큼 양쪽 인물의 연결 수를 올린다', () => {
    const nodes = [node('a', 1), node('b', 2), node('c', 3)];
    const edges = [edge('a', 'b'), edge('b', 'c')];
    const degree = computeDegrees(nodes, edges);
    expect(degree.get('a')).toBe(1);
    expect(degree.get('b')).toBe(2);
    expect(degree.get('c')).toBe(1);
  });

  it('노드에 없는 id 를 가리키는 간선은 세지 않는다', () => {
    const nodes = [node('a', 1), node('b', 2)];
    const degree = computeDegrees(nodes, [edge('a', 'ghost'), edge('b', 'a')]);
    expect(degree.get('a')).toBe(1);
    expect(degree.get('b')).toBe(1);
  });
});

describe('centralNodeIndex — 기본 포커스로 놓을 인물', () => {
  it('연결이 가장 많은 인물을 고른다', () => {
    const nodes = [node('a', 1), node('b', 2), node('c', 3)];
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(centralNodeIndex(nodes, edges)).toBe(1);
  });

  it('연결 수가 같으면 먼저 등장한 인물을 고른다', () => {
    const nodes = [node('late', 9), node('early', 2)];
    expect(centralNodeIndex(nodes, [edge('late', 'early')])).toBe(1);
  });

  it('노드가 없으면 -1', () => {
    expect(centralNodeIndex([], [])).toBe(-1);
  });
});

describe('nodeRadius — 연결 수가 많을수록 크지만 상한이 있다', () => {
  it('연결이 없으면(0) 최소 크기', () => {
    expect(nodeRadius(0)).toBeCloseTo(nodeRadius(1), 5);
  });

  it('연결이 많을수록 커진다', () => {
    expect(nodeRadius(4)).toBeGreaterThan(nodeRadius(1));
  });

  it('연결이 아주 많아도 상한을 넘지 않는다', () => {
    expect(nodeRadius(21)).toBe(nodeRadius(100));
  });
});

describe('forceLayout — 힘-분산 배치', () => {
  it('노드 개수만큼 좌표를 만들고 순서를 유지한다', () => {
    const nodes = [node('a', 1), node('b', 2), node('c', 3)];
    expect(forceLayout(nodes, [])).toHaveLength(3);
    expect(forceLayout([], [])).toHaveLength(0);
  });

  it('노드가 1개면 좌표 하나를 낸다', () => {
    expect(forceLayout([node('a', 1)], [])).toHaveLength(1);
  });

  it('같은 입력에 항상 같은 좌표를 낸다 — 무작위성이 없다', () => {
    const nodes = [node('a', 1), node('b', 2), node('c', 3), node('d', 4)];
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')];
    expect(forceLayout(nodes, edges)).toEqual(forceLayout(nodes, edges));
  });

  it('서로 다른 인물은 겹치지 않는 좌표를 갖는다', () => {
    const nodes = [node('a', 1), node('b', 2), node('c', 3), node('d', 4), node('e', 5)];
    const points = forceLayout(nodes, []);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThan(1);
      }
    }
  });

  it('간선으로 이어진 인물은 무관한 인물보다 서로 더 가깝다', () => {
    // a-b 는 간선으로 이어져 있고, c 는 아무와도 안 이어져 있다
    const nodes = [node('a', 1), node('b', 2), node('c', 3)];
    const points = forceLayout(nodes, [edge('a', 'b')], { iterations: 300 });
    const distAB = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    const distAC = Math.hypot(points[0].x - points[2].x, points[0].y - points[2].y);
    expect(distAB).toBeLessThan(distAC);
  });
});

describe('boundingBox — 배치를 감싸는 사각형', () => {
  it('패딩만큼 여유를 둔다', () => {
    const box = boundingBox([{ x: 0, y: 0 }, { x: 10, y: 10 }], 5);
    expect(box).toEqual({ x: -5, y: -5, width: 20, height: 20 });
  });

  it('점이 없으면 기본 크기를 반환한다', () => {
    const box = boundingBox([]);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});

describe('pickNonOverlapping — 겹치는 라벨은 우선순위 낮은 쪽을 뺀다', () => {
  it('겹치지 않으면 전부 남긴다', () => {
    const boxes = [
      { x: 0, y: 0, width: 10, height: 10, priority: 1 },
      { x: 100, y: 100, width: 10, height: 10, priority: 1 },
    ];
    expect(pickNonOverlapping(boxes)).toHaveLength(2);
  });

  it('겹치면 우선순위 높은 쪽만 남긴다', () => {
    const low = { x: 0, y: 0, width: 20, height: 20, priority: 1 };
    const high = { x: 5, y: 5, width: 20, height: 20, priority: 9999 };
    const kept = pickNonOverlapping([low, high]);
    expect(kept).toHaveLength(1);
    expect(kept[0].priority).toBe(9999);
  });
});

describe('estimateTextWidth — 글자수 기반 너비 어림', () => {
  it('글자가 길수록 너비가 커진다', () => {
    expect(estimateTextWidth('가나다', 6)).toBeGreaterThan(estimateTextWidth('가', 6));
  });
});
