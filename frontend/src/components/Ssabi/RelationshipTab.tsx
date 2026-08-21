import type { GraphResponse } from '../../types';
import Loading from '../common/Loading';
import RelationshipGraph from './RelationshipGraph';

/**
 * 인물 관계도 탭 — 기본 탭 (FR-SVB-002)
 *
 * 시안(48:1067) 구성 — 그래프 영역(364×280) 위, 인물 카드 목록 아래.
 * 그래프는 React Flow 로 그리고, 인물은 카드로 나열한다.
 *
 * 관계 목록은 시안에 없으나 유지한다. 두 가지 이유 —
 *   ① 간선 라벨을 글자로 병기하는 수단이 그래프 하나뿐이면, 그래프가 뜨지 않는 환경에서
 *      NFR-USE-006 이 깨진다.
 *   ② 그래프는 좌표·크기에 의존하지만 목록은 그렇지 않아 검증이 안정적이다.
 *
 * ⚠️ 시안의 인물 카드에는 역할("야간 알바생 · 기억을 잃은 사내")과 설명 2줄이 있으나
 *    `GraphNode` 계약에 그 필드가 없다. 없는 데이터를 지어내지 않는다 (CLAUDE.md 6장).
 *    계약이 주는 별칭(aliases)을 그 자리에 놓는다.
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

  const nameOf = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <div className="space-y-5">
      <RelationshipGraph graph={graph} />

      <section aria-label="인물" className="space-y-3">
        <h3 className="text-xs font-bold text-faint">인물 {graph.nodes.length}</h3>
        <ul className="space-y-3">
          {graph.nodes.map((node) => (
            <li key={node.id} className="rounded-card border border-line bg-surface p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-sm font-bold text-ink">{node.name}</span>
                {node.aliases.length > 0 ? (
                  <span className="text-[11px] text-muted">{node.aliases.join(' · ')}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="관계" className="space-y-2">
        <h3 className="text-xs font-bold text-faint">관계 {graph.edges.length}</h3>
        <ul className="space-y-1.5">
          {graph.edges.map((edge) => (
            <li key={`${edge.source}-${edge.target}`} className="text-xs text-muted">
              {nameOf(edge.source)} — {nameOf(edge.target)} :{' '}
              <span className="font-bold text-ink">{edge.label}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
