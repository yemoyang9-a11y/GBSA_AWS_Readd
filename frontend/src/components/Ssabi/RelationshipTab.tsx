import { useMemo, useState } from 'react';
import type { GraphResponse } from '../../types';
import Loading from '../common/Loading';
import RelationshipGraph from './RelationshipGraph';
import { graphMilestones, graphUpTo } from './graphFilter';

/**
 * 인물 관계도 탭 — 기본 탭 (FR-SVB-002)
 *
 * 지도형 리디자인(2026-08-24, `docs-local/reader-map-graph.html` 구조 반영) — 인물
 * 카드는 항상 목록으로 보이되, **그래프에서 인물을 선택했을 때만 그 인물의 관계 태그가
 * 펼쳐진다.** 카드를 눌러도 같은 선택 상태를 공유한다(그래프 쪽 클릭과 동등) — 이 선택
 * 상태(`selected`)는 이 컴포넌트가 소유하고, RelationshipGraph에는 controlled prop으로
 * 내려준다. 추후 "본문에서 인물명을 누르면 관계도가 그 인물로 포커싱"되는 기능이
 * 들어올 자리도 여기다 — 그 기능은 이 `setSelected`를 그대로 호출하면 된다.
 *
 * ⚠️ 정책 변경(2026-08-24) — 예전엔 "관계" 섹션이 선택과 무관하게 항상 전부 펼쳐져
 *    있었다(NFR-USE-006: 라벨을 글자로 병기, 색상만으로 구분하지 않는다). 그 요구
 *    자체는 여전히 지킨다 — 다만 "항상 전부"가 아니라 "선택하면 텍스트로 나온다"로
 *    바뀌었다. 목업이 채택한 방식을 그대로 따른 것이라 팀 승인 없이 되돌리지 않는다.
 *    관련 테스트(RelationshipTab.test.tsx)도 이 정책에 맞춰 같이 고쳤다.
 *
 * ## 되감기 슬라이더
 *
 * 읽은 범위 안에서 과거 시점의 관계도를 볼 수 있게 한다. 서버가 이미 기준점 이하로 걸러
 * 내려보냈으므로 이건 **받은 데이터 안의 표시 필터**이고, 서버에 다시 묻지 않는다.
 * 눈금을 받은 데이터에서 만들기 때문에 슬라이더 오른쪽 끝이 곧 현재 진도이며,
 * 그 너머는 막힌 게 아니라 **존재하지 않는다** (graphFilter.ts 주석 참조).
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
  const [selected, setSelected] = useState<string | null>(null);

  const milestones = useMemo(() => (graph ? graphMilestones(graph) : []), [graph]);
  const latest = milestones[milestones.length - 1] ?? 0;

  // 고른 눈금이 사라졌으면(페이지를 옮겨 데이터가 바뀌었으면) 최신으로 되돌린다
  const at = picked !== null && milestones.includes(picked) ? picked : latest;
  const shown = useMemo(() => (graph ? graphUpTo(graph, at) : null), [graph, at]);

  // 되감아서 선택했던 인물이 아직 안 나왔으면 선택을 무시한다(지우지는 않는다 —
  // 다시 앞으로 감으면 그대로 복원된다)
  const activeSelected =
    selected && shown?.nodes.some((n) => n.id === selected) ? selected : null;

  if (failed) return <p role="alert">관계도를 불러오지 못했습니다</p>;
  if (!graph || !shown) return <Loading fullScreen={false} message="인물 관계를 정리하는 중" />;

  const relationsOf = (id: string) =>
    shown.edges
      .filter((edge) => edge.source === id || edge.target === id)
      .map((edge) => {
        const otherId = edge.source === id ? edge.target : edge.source;
        const other = shown.nodes.find((n) => n.id === otherId);
        return { key: `${edge.source}-${edge.target}`, name: other?.name ?? otherId, label: edge.label };
      });

  return (
    <div className="space-y-5">
      <RelationshipGraph graph={shown} selectedId={activeSelected} onSelect={setSelected} />

      {/* 시안(reader-map-graph.html)의 .hintbar 그대로 — 조작 안내 + 명시적 선택 해제.
          예전엔 같은 카드를 다시 눌러야만 접혔는데, 그래프 위 다른 곳을 눌러도 되지만
          그 동작이 눈에 안 보인다 — 이 버튼으로 "선택을 지우는 방법이 있다"를 드러낸다. */}
      <div className="flex items-center justify-between text-[11px] text-faint">
        <span>두 손가락으로 확대 · 끌어서 이동</span>
        <button type="button" onClick={() => setSelected(null)} className="font-bold text-ssabi underline">
          선택 해제
        </button>
      </div>

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
        <h3 className="text-xs font-bold text-faint">등장인물 {shown.nodes.length}</h3>
        <ul className="space-y-3">
          {shown.nodes.map((node) => {
            const isOpen = node.id === activeSelected;
            const relations = isOpen ? relationsOf(node.id) : [];
            return (
              <li key={node.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setSelected(isOpen ? null : node.id)}
                  className={`w-full rounded-card border p-3.5 text-left transition-colors ${
                    isOpen ? 'border-ssabi bg-ssabi-soft' : 'border-line bg-surface'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-sm font-bold text-ink">{node.name}</span>
                    {node.aliases.length > 0 ? (
                      <span className="text-[11px] text-muted">{node.aliases.join(' · ')}</span>
                    ) : null}
                  </div>
                  {isOpen && relations.length > 0 ? (
                    <ul aria-label="관계" className="mt-2.5 flex flex-wrap gap-1.5 border-t border-dashed border-line pt-2.5">
                      {relations.map((rel) => (
                        <li
                          key={rel.key}
                          className="rounded-pill bg-ssabi/10 px-2 py-1 text-[11px] text-ssabi"
                        >
                          {rel.name} · {rel.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
