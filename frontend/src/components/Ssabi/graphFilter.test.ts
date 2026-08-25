import { MAJOR_CHARACTER_MIN_DEGREE, filterMajorCharacters, graphMilestones, graphUpTo } from './graphFilter';
import type { GraphResponse } from '../../types';

/**
 * 관계도 되감기 — 표시 필터.
 *
 * ⚠️ 이 테스트가 증명하는 것은 **받은 데이터 안에서 과거 시점을 고르는 동작**이지
 *    서버의 상한 강제가 아니다. 상한은 서버가 응답을 만들 때 이미 걸었고, 여기 들어오는
 *    입력은 전부 기준점 이하다.
 */
const graph: GraphResponse = {
  nodes: [
    { id: 'jeong', name: '정주사', first_appearance_page: 1, aliases: [] },
    { id: 'chobong', name: '초봉', first_appearance_page: 3, aliases: [] },
    { id: 'gyebong', name: '계봉', first_appearance_page: 8, aliases: [] },
  ],
  edges: [
    { source: 'jeong', target: 'chobong', label: '부녀', established_page: 3 },
    { source: 'jeong', target: 'gyebong', label: '부녀', established_page: 8 },
  ],
};

describe('graphMilestones — 관계도가 달라지는 지점', () => {
  it('인물 등장·관계 확립 페이지를 오름차순 중복 없이 모은다', () => {
    expect(graphMilestones(graph)).toEqual([1, 3, 8]);
  });

  it('빈 그래프면 눈금이 없다', () => {
    expect(graphMilestones({ nodes: [], edges: [] })).toEqual([]);
  });

  it('관계만 있는 페이지도 눈금이 된다 — 인물은 그대로인데 관계가 늘 수 있다', () => {
    const later: GraphResponse = {
      ...graph,
      edges: [...graph.edges, { source: 'chobong', target: 'gyebong', label: '자매', established_page: 13 }],
    };
    expect(graphMilestones(later)).toEqual([1, 3, 8, 13]);
  });
});

describe('graphUpTo — 과거 시점의 관계도', () => {
  it('그 시점에 아직 등장하지 않은 인물을 뺀다', () => {
    const early = graphUpTo(graph, 3);
    expect(early.nodes.map((n) => n.name)).toEqual(['정주사', '초봉']);
  });

  it('그 시점에 아직 확립되지 않은 관계를 뺀다', () => {
    const early = graphUpTo(graph, 3);
    expect(early.edges).toHaveLength(1);
    expect(early.edges[0].label).toBe('부녀');
  });

  it('한쪽 인물이 아직 없는 관계는 그리지 않는다', () => {
    // 관계는 1페이지에 확립됐다고 하지만 계봉은 8페이지에 등장한다 — 그릴 수 없다
    const odd: GraphResponse = {
      nodes: graph.nodes,
      edges: [{ source: 'jeong', target: 'gyebong', label: '부녀', established_page: 1 }],
    };
    expect(graphUpTo(odd, 1).edges).toHaveLength(0);
  });

  it('마지막 눈금에서는 받은 것 전부가 남는다 — 오른쪽 끝이 곧 현재 진도다', () => {
    const milestones = graphMilestones(graph);
    const full = graphUpTo(graph, milestones[milestones.length - 1]);
    expect(full.nodes).toHaveLength(graph.nodes.length);
    expect(full.edges).toHaveLength(graph.edges.length);
  });

  it('눈금보다 큰 값을 넣어도 받은 것 이상은 나오지 않는다 — 넘어갈 데이터가 없다', () => {
    const beyond = graphUpTo(graph, 9999);
    expect(beyond.nodes).toHaveLength(graph.nodes.length);
    expect(beyond.edges).toHaveLength(graph.edges.length);
  });
});

describe('filterMajorCharacters — 주요인물 표시 필터', () => {
  // hub는 4명과 이어져 degree=4, 나머지(a~d)는 hub 하나뿐이라 degree=1, e는 a와만
  // 이어져 degree=1이다 — 임계값 4에서 hub만 남아야 한다.
  const hubGraph: GraphResponse = {
    nodes: [
      { id: 'hub', name: '허브', first_appearance_page: 1, aliases: [] },
      { id: 'a', name: 'A', first_appearance_page: 1, aliases: [] },
      { id: 'b', name: 'B', first_appearance_page: 1, aliases: [] },
      { id: 'c', name: 'C', first_appearance_page: 1, aliases: [] },
      { id: 'd', name: 'D', first_appearance_page: 1, aliases: [] },
      { id: 'e', name: 'E', first_appearance_page: 1, aliases: [] },
    ],
    edges: [
      { source: 'hub', target: 'a', label: '지인', established_page: 1 },
      { source: 'hub', target: 'b', label: '지인', established_page: 1 },
      { source: 'hub', target: 'c', label: '지인', established_page: 1 },
      { source: 'hub', target: 'd', label: '지인', established_page: 1 },
      { source: 'e', target: 'a', label: '지인', established_page: 1 },
    ],
  };

  it('연결 수가 임계값 미만인 인물을 뺀다', () => {
    expect(filterMajorCharacters(hubGraph, 4).nodes.map((n) => n.id)).toEqual(['hub']);
  });

  it('걸러진 인물이 걸린 간선도 같이 뺀다 — 한쪽만 남는 간선은 그릴 수 없다', () => {
    expect(filterMajorCharacters(hubGraph, 4).edges).toHaveLength(0);
  });

  it('임계값을 낮추면 더 많이 남는다 (positive — 위 negative와 짝)', () => {
    expect(filterMajorCharacters(hubGraph, 1).nodes).toHaveLength(6);
  });

  it('임계값을 지정하지 않으면 기본값(MAJOR_CHARACTER_MIN_DEGREE)을 쓴다', () => {
    expect(filterMajorCharacters(hubGraph)).toEqual(filterMajorCharacters(hubGraph, MAJOR_CHARACTER_MIN_DEGREE));
  });

  it('아무도 임계값을 못 넘으면 빈 그래프를 낸다 — 부분 표시로 넘어가지 않는다', () => {
    const sparse: GraphResponse = {
      nodes: [{ id: 'x', name: 'X', first_appearance_page: 1, aliases: [] }],
      edges: [],
    };
    const filtered = filterMajorCharacters(sparse, 4);
    expect(filtered.nodes).toHaveLength(0);
    expect(filtered.edges).toHaveLength(0);
  });
});
