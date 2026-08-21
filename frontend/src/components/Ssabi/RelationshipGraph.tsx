import { ReactFlow, Background, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphResponse } from '../../types';
import { centralNodeIndex, radialLayout, shouldShowEdgeLabels } from './graphLayout';

/**
 * 관계도 그래프 렌더 — S4
 *
 * 서버 JSON(nodes/edges)을 그대로 그린다. 라벨을 글자로 병기하며 색상만으로 구분하지 않는다
 * (NFR-USE-006). 간선은 이력형 최신 라벨 1개만 내려온다 (A6, FR-CHR-001 🚦).
 * 좌표는 graphLayout.ts 의 **방사형 배치**로 만든다 — 중심 인물 1명 + 나머지를 둘레에
 * (스펙 §6). 중심 인물은 배치 규칙이 데이터로 고르며, 여기서는 그 결과를 받아 그리기만 한다.
 *
 * ⚠️ 여기서 노드·간선을 걸러내지 않는다. 서버가 이미 기준점 이하로 필터해 내려보냈고,
 *    초과 여부를 판별하는 코드를 프론트에 두지 않는다 (절대 규칙 7번).
 *
 * ⚠️ 색이 hex 리터럴인 이유 — React Flow 는 노드·간선을 자기 인라인 스타일로 그려서
 *    Tailwind 클래스가 닿지 않는다. G11 의 "토큰 이름으로 쓴다"를 지킬 수 없는 유일한
 *    구간이라, 값을 아래 한 곳에 모으고 어느 토큰의 값인지 이름으로 남긴다.
 *    tailwind.config.js 의 해당 토큰을 바꾸면 여기도 함께 고쳐야 한다.
 *
 * 간선이 많으면(graphLayout.ts의 shouldShowEdgeLabels 기준 초과) 캔버스 라벨을 생략한다
 * (polish, 2026-08-21) — 실 데이터(100p 시점, 간선 51개)에서 라벨이 중심 근처에 뭉쳐
 * 읽을 수 없었다. 아래 "관계" 목록이 항상 텍스트로 병기하므로 NFR-USE-006은 그대로 지켜진다.
 */
const TOKEN = {
  surface: '#ffffff',
  line: '#ebe6e0',
  ink: '#1c1b1a',
  muted: '#6e6a66',
} as const;

export default function RelationshipGraph({ graph }: { graph: GraphResponse }) {
  const centerIndex = centralNodeIndex(graph.nodes, graph.edges);
  const positions = radialLayout(graph.nodes.length, centerIndex);

  const nodes: Node[] = graph.nodes.map((node, i) => ({
    id: node.id,
    position: positions[i],
    data: { label: node.name },
    type: 'default',
    draggable: false,
    style: {
      background: TOKEN.surface,
      // 중심 인물은 테두리를 강조해 한눈에 구분되게 한다 — 색만으로 구분하지 않으므로
      // 이름은 그대로 글자로 남는다 (NFR-USE-006)
      border: i === centerIndex ? `1.5px solid ${TOKEN.ink}` : `1px solid ${TOKEN.line}`,
      borderRadius: 9999,
      padding: '6px 12px',
      fontSize: 12,
      fontWeight: i === centerIndex ? 700 : 400,
      color: TOKEN.ink,
    },
  }));

  const showLabels = shouldShowEdgeLabels(graph.edges.length);

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    // NFR-USE-006(글자로 병기)은 아래 "관계" 목록이 항상 만족한다 — 캔버스 라벨은
    // 간선이 적어 겹치지 않을 때만 얹는 보너스다 (graphLayout.ts의 EDGE_LABEL_LIMIT 참조).
    label: showLabels ? edge.label : undefined,
    labelStyle: { fontSize: 11, fill: TOKEN.muted },
    style: { stroke: TOKEN.line },
  }));

  return (
    <div className="h-[280px] w-full overflow-hidden rounded-card border border-line bg-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={TOKEN.line} gap={16} />
      </ReactFlow>
    </div>
  );
}
