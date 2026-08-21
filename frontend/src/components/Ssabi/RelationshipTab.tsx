import { useMemo, useState } from 'react';
import type { GraphResponse } from '../../types';
import Loading from '../common/Loading';
import RelationshipGraph from './RelationshipGraph';
import { graphMilestones, graphUpTo } from './graphFilter';

/**
 * 인물 관계도 탭 — 기본 탭 (FR-SVB-002)
 *
 * 시안(48:1067) 구성 — 그래프 영역 위, 인물 카드 목록 아래.
 *
 * ## 되감기 슬라이더
 *
 * 읽은 범위 안에서 과거 시점의 관계도를 볼 수 있게 한다. 서버가 이미 기준점 이하로 걸러
 * 내려보냈으므로 이건 **받은 데이터 안의 표시 필터**이고, 서버에 다시 묻지 않는다.
 * 눈금을 받은 데이터에서 만들기 때문에 슬라이더 오른쪽 끝이 곧 현재 진도이며,
 * 그 너머는 막힌 게 아니라 **존재하지 않는다** (graphFilter.ts 주석 참조).
 *
 * 관계 목록은 시안에 없으나 유지한다 — 간선 라벨을 글자로 병기하는 수단이 그래프
 * 하나뿐이면 그래프가 뜨지 않는 환경에서 NFR-USE-006 이 깨진다.
 *
 * ⚠️ 시안의 인물 카드에는 역할과 설명 2줄이 있으나 `GraphNode` 계약에 그 필드가 없다.
 *    없는 데이터를 지어내지 않는다 (CLAUDE.md 6장). 계약이 주는 별칭을 그 자리에 놓는다.
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
  const [picked, setPicked] = useState<number | null>(null);

  const milestones = useMemo(() => (graph ? graphMilestones(graph) : []), [graph]);
  const latest = milestones[milestones.length - 1] ?? 0;

  // 고른 눈금이 사라졌으면(페이지를 옮겨 데이터가 바뀌었으면) 최신으로 되돌린다
  const at = picked !== null && milestones.includes(picked) ? picked : latest;
  const shown = useMemo(() => (graph ? graphUpTo(graph, at) : null), [graph, at]);

  if (failed) return <p role="alert">관계도를 불러오지 못했습니다</p>;
  if (!graph || !shown) return <Loading />;

  const nameOf = (id: string) => shown.nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <div className="space-y-5">
      <RelationshipGraph graph={shown} />

      {milestones.length > 1 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <label htmlFor="graph-scrub" className="text-faint">
              시점 되감기
            </label>
            <span className="font-bold text-ink">
              {at === latest ? '현재까지' : `${at}페이지 시점`}
            </span>
          </div>
          <input
            id="graph-scrub"
            type="range"
            min={0}
            max={milestones.length - 1}
            step={1}
            value={Math.max(0, milestones.indexOf(at))}
            onChange={(event) => setPicked(milestones[Number(event.target.value)])}
            className="w-full accent-ssabi"
          />
        </div>
      ) : null}

      <section aria-label="인물" className="space-y-3">
        <h3 className="text-xs font-bold text-faint">인물 {shown.nodes.length}</h3>
        <ul className="space-y-3">
          {shown.nodes.map((node) => (
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
        <h3 className="text-xs font-bold text-faint">관계 {shown.edges.length}</h3>
        <ul className="space-y-1.5">
          {shown.edges.map((edge) => (
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
