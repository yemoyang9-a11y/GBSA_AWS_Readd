import type { GraphResponse } from '../../types';
import Loading from '../common/Loading';

/**
 * 인물 관계도 탭 — 기본 탭 (FR-SVB-002)
 *
 * 지금은 **데이터 연결까지만** 돼 있다. 노드·간선을 목록으로 드러내 조회 결과를 눈으로
 * 확인할 수 있게 해 둔 것이고, 그래프 시각화(React Flow)는 디자인 확정 후 붙인다.
 * 간선 라벨은 색이 아니라 글자로 병기한다 (NFR-USE-006) — 목록 형태에서도 지킨다.
 *
 * 조회 실패는 부분 표시로 넘어가지 않는다 (FR-SPL-005 🚦).
 */
export default function RelationshipTab({
  graph,
  failed,
}: {
  graph: GraphResponse | null;
  failed: boolean;
}) {
  if (failed) return <p role="alert">관계도를 불러오지 못했습니다</p>;
  if (!graph) return <Loading />;

  return (
    <div className="space-y-4 p-4">
      <section>
        <h3 className="font-semibold">인물 {graph.nodes.length}</h3>
        <ul>
          {graph.nodes.map((node) => (
            <li key={node.id}>
              {node.name}
              {node.aliases.length > 0 ? ` (${node.aliases.join(', ')})` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">관계 {graph.edges.length}</h3>
        <ul>
          {graph.edges.map((edge) => {
            const source = graph.nodes.find((n) => n.id === edge.source)?.name ?? edge.source;
            const target = graph.nodes.find((n) => n.id === edge.target)?.name ?? edge.target;
            return (
              <li key={`${edge.source}-${edge.target}`}>
                {source} — {target} : {edge.label}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
