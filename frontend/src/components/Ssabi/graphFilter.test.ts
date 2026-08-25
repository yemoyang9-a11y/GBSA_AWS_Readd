import { MAJOR_CHARACTER_TOP_N, filterMajorCharacters, graphMilestones, graphUpTo } from './graphFilter';
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

describe('filterMajorCharacters — 주요인물 표시 필터 (연결 수 상위 N명)', () => {
  // 연결 수: hub=4(a·b·c·d), a=2(hub·e), b=c=d=e=1. first_appearance_page를 서로 다르게
  // 둬서(1~6) 동점 tie-break(등장 순서)이 정렬 안정성에 기대지 않고 명시적으로 검증되게 한다.
  // 등수: hub(4) > a(2) > b(3p) > c(4p) > d(5p) > e(6p) — 뒤 넷은 전부 degree 1 동점.
  const hubGraph: GraphResponse = {
    nodes: [
      { id: 'hub', name: '허브', first_appearance_page: 1, aliases: [] },
      { id: 'a', name: 'A', first_appearance_page: 2, aliases: [] },
      { id: 'b', name: 'B', first_appearance_page: 3, aliases: [] },
      { id: 'c', name: 'C', first_appearance_page: 4, aliases: [] },
      { id: 'd', name: 'D', first_appearance_page: 5, aliases: [] },
      { id: 'e', name: 'E', first_appearance_page: 6, aliases: [] },
    ],
    edges: [
      { source: 'hub', target: 'a', label: '지인', established_page: 1 },
      { source: 'hub', target: 'b', label: '지인', established_page: 1 },
      { source: 'hub', target: 'c', label: '지인', established_page: 1 },
      { source: 'hub', target: 'd', label: '지인', established_page: 1 },
      { source: 'e', target: 'a', label: '지인', established_page: 1 },
    ],
  };

  it('상위 N명만 남긴다 — N=1이면 연결 수가 가장 많은 인물 하나뿐', () => {
    expect(filterMajorCharacters(hubGraph, 1).nodes.map((n) => n.id)).toEqual(['hub']);
  });

  it('N을 늘리면 더 많이 남는다 (positive — 위 N=1과 짝)', () => {
    expect(filterMajorCharacters(hubGraph, 3).nodes.map((n) => n.id)).toEqual(['hub', 'a', 'b']);
  });

  it('연결 수가 같으면 먼저 등장한 인물을 우선한다 — b(3p)가 c·d·e(4~6p)보다 앞선다', () => {
    // b·c·d·e 전부 degree 1 동점. N=3은 hub·a 다음 한 자리만 더 있어 그중 가장 먼저
    // 등장한 b만 들어가야 한다 — c·d·e가 대신 들어가면 tie-break이 안 먹힌 것이다.
    const nodes = filterMajorCharacters(hubGraph, 3).nodes.map((n) => n.id);
    expect(nodes).toContain('b');
    expect(nodes).not.toContain('c');
    expect(nodes).not.toContain('d');
    expect(nodes).not.toContain('e');
  });

  it('걸러진 인물이 걸린 간선도 같이 뺀다 — 한쪽만 남는 간선은 그릴 수 없다', () => {
    // N=2: hub·a만 남는다. hub-b/c/d와 e-a는 상대가 빠져 같이 빠지고, hub-a만 남는다.
    const edges = filterMajorCharacters(hubGraph, 2).edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'hub', target: 'a' });
  });

  it('N을 지정하지 않으면 기본값(MAJOR_CHARACTER_TOP_N)을 쓴다', () => {
    expect(filterMajorCharacters(hubGraph)).toEqual(filterMajorCharacters(hubGraph, MAJOR_CHARACTER_TOP_N));
  });

  it('전체 인물 수가 N 이하면 아무도 걸러지지 않는다 — "주요인물"과 "전체"가 같아진다', () => {
    // 절대 임계값 방식(이전 구현)이었다면 아무도 기준을 못 넘어 전부 빠질 수 있었다 —
    // 상위 N 방식에선 애초에 그런 "전원 탈락" 상태 자체가 없다(2026-08-25, "많다가
    // 어느 순간 확 줄어드는 현상" 재발 방지 — graphFilter.ts MAJOR_CHARACTER_TOP_N 주석).
    const sparse: GraphResponse = {
      nodes: [
        { id: 'x', name: 'X', first_appearance_page: 1, aliases: [] },
        { id: 'y', name: 'Y', first_appearance_page: 2, aliases: [] },
      ],
      edges: [],
    };
    const filtered = filterMajorCharacters(sparse, 8);
    expect(filtered.nodes).toHaveLength(2);
  });
});
