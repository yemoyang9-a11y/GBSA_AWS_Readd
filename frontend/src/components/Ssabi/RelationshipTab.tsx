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
 * 눈금을 받은 데이터에서 만들기 때문에 조작 가능한 오른쪽 끝이 곧 현재 진도이며,
 * 그 너머는 막힌 게 아니라 **존재하지 않는다** (graphFilter.ts 주석 참조).
 *
 * 트랙 자체는 1페이지~전체 분량(`totalPages`)까지 그려서 "책 전체 대비 지금 어디까지
 * 왔는지" 감을 준다(2026-08-25, 사용자 요청). 다만 손잡이가 실제로 움직이는 구간은
 * 여전히 `milestones`(=읽은 범위) 안으로 한정한다 — 조작 가능한 `<input type="range">`
 * 자체는 그대로 두고, 그 뒤에 "아직 못 읽은 구간"을 나타내는 비활성 막대를 이어붙이는
 * 방식이다. 두 막대의 폭은 `flexGrow`에 **정수 그대로**(진도 페이지 수, 남은 페이지 수)를
 * 준다 — `/전체` 나눗셈으로 비율(%)을 직접 계산하지 않는다. 절대 규칙 2번("기준점
 * 결정기 밖에서 % 계산 금지, 프론트 포함")이 겨냥하는 건 스포일러 상한과 관련된 진도율
 * 계산인데, 나눗셈으로 값을 만들면 그 계산과 형식적으로 겹쳐 보일 여지가 있어 피했다 —
 * flexbox가 두 정수 비(比)로 폭을 알아서 나누게 두는 쪽을 택함(브라우저의 레이아웃
 * 계산이지 우리 코드의 진도율 계산이 아니다). `totalPages`는 목차(전체 챕터) 기준이라
 * 애초에 상한 대상이 아니다(R3 — 목차는 전체 상시 노출).
 *
 * ⚠️ 시안의 인물 카드에는 역할과 설명 2줄이 있으나 `GraphNode` 계약에 그 필드가 없다.
 *    없는 데이터를 지어내지 않는다 (CLAUDE.md 6장). 계약이 주는 별칭을 그 자리에 놓는다.
 *
 * 조회 실패는 부분 표시로 넘어가지 않는다 (FR-SPL-005 🚦).
 */
export default function RelationshipTab({
  graph,
  failed,
  totalPages,
}: {
  graph: GraphResponse | null;
  failed: boolean;
  /** 목차 기준 전체 페이지 수(상한 대상 아님, R3). 트랙 오른쪽 끝 표시에만 쓴다. */
  totalPages?: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [resultsOpen, setResultsOpen] = useState(false);

  const milestones = useMemo(() => (graph ? graphMilestones(graph) : []), [graph]);
  const latest = milestones[milestones.length - 1] ?? 0;
  // totalPages가 아직 안 왔거나(초기 로딩) latest보다 작게 들어오면(있을 수 없는 값) 그냥
  // latest로 맞춰 미조작 막대 폭이 0이 되게 한다 — 트랙이 찌그러지는 것만 막는다.
  const bookTotal = Math.max(totalPages ?? latest, latest);
  const unread = bookTotal - latest;

  // 고른 눈금이 사라졌으면(페이지를 옮겨 데이터가 바뀌었으면) 최신으로 되돌린다
  const at = picked !== null && milestones.includes(picked) ? picked : latest;
  const shown = useMemo(() => (graph ? graphUpTo(graph, at) : null), [graph, at]);

  // 되감아서 선택했던 인물이 아직 안 나왔으면 선택을 무시한다(지우지는 않는다 —
  // 다시 앞으로 감으면 그대로 복원된다)
  const activeSelected =
    selected && shown?.nodes.some((n) => n.id === selected) ? selected : null;

  if (failed) return <p role="alert" className="text-brief-muted">관계도를 불러오지 못했습니다</p>;
  if (!graph || !shown) return <Loading fullScreen={false} message="인물 관계를 정리하는 중" />;

  // 검색 대상은 되감기로 지금 화면에 보이는 인물(shown.nodes)로만 한정한다 — 아직
  // 등장하지 않은 시점으로 되감아 놓고 그 이후 인물을 검색해 포커싱하면, 검색이 곧
  // 기준점을 우회하는 별도 조회 경로가 된다(절대 규칙 7번과 같은 종류의 문제).
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? shown.nodes.filter(
        (node) =>
          node.name.toLowerCase().includes(normalizedQuery) ||
          node.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))
      )
    : [];

  function focusOn(id: string) {
    setSelected(id);
    setQuery('');
    setResultsOpen(false);
  }

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
      <div className="flex items-center justify-between text-[11px] text-brief-muted">
        <span>두 손가락으로 확대 · 끌어서 이동</span>
        <button type="button" onClick={() => setSelected(null)} className="font-bold text-brief-accent underline">
          선택 해제
        </button>
      </div>

      {milestones.length > 1 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <label htmlFor="graph-scrub" className="text-brief-muted">
              시점 되감기
            </label>
            <span className="font-bold text-brief-ink">
              {at === latest ? '현재까지' : `${at}페이지 시점`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ flexGrow: latest || 1, flexBasis: 0 }}>
              <input
                id="graph-scrub"
                type="range"
                min={0}
                max={milestones.length - 1}
                step={1}
                value={Math.max(0, milestones.indexOf(at))}
                onChange={(event) => setPicked(milestones[Number(event.target.value)])}
                className="w-full accent-brief-accent"
              />
            </div>
            {unread > 0 ? (
              <div
                aria-hidden="true"
                data-testid="graph-scrub-unread"
                className="h-1.5 shrink-0 rounded-full bg-brief-rule"
                style={{ flexGrow: unread, flexBasis: 0 }}
              />
            ) : null}
          </div>
          <div className="flex justify-between text-[10px] text-brief-muted">
            <span>1p</span>
            <span>{bookTotal}p</span>
          </div>
        </div>
      ) : null}

      <section aria-label="인물" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-brief-muted">인물 {shown.nodes.length}</h3>

          {/* 시안(첫 번째 스크린샷)의 알약형 검색창 — 클릭 후 포커싱은 그래프가 이미
              selectedId 로 하고 있어(RelationshipGraph.tsx), 여기서는 검색 결과를 골라
              그 setSelected 를 그대로 호출하기만 한다. */}
          <div className="relative">
            <div className="flex items-center gap-1.5 rounded-pill border border-brief-rule bg-brief-page px-3 py-1.5">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="shrink-0 text-brief-muted"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <line x1="15.3" y1="15.3" x2="20" y2="20" />
              </svg>
              <label htmlFor="character-search" className="sr-only">
                인물 검색
              </label>
              <input
                id="character-search"
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setResultsOpen(true);
                }}
                onFocus={() => setResultsOpen(true)}
                onBlur={() => setResultsOpen(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && searchResults.length > 0) {
                    event.preventDefault();
                    focusOn(searchResults[0].id);
                  }
                  if (event.key === 'Escape') setQuery('');
                }}
                placeholder="검색"
                className="w-20 bg-transparent text-[11px] text-brief-ink outline-none placeholder:text-brief-muted"
              />
            </div>

            {resultsOpen && normalizedQuery ? (
              <ul
                role="listbox"
                aria-label="인물 검색 결과"
                className="absolute right-0 top-full z-10 mt-1 max-h-48 w-44 overflow-y-auto rounded-xl border border-brief-rule bg-white py-1 shadow-brief-soft-sm"
              >
                {searchResults.length > 0 ? (
                  searchResults.map((node) => (
                    <li key={node.id} role="option" aria-selected={node.id === activeSelected}>
                      {/* mousedown 시점에 preventDefault 하지 않으면 input 의 onBlur 가
                          먼저 일어나 목록이 닫혀버려 클릭이 아무 데도 안 먹는다. */}
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => focusOn(node.id)}
                        className="block w-full px-3 py-1.5 text-left text-xs text-brief-ink hover:bg-brief-accent-soft"
                      >
                        {node.name}
                        {node.aliases.length > 0 ? (
                          <span className="ml-1.5 text-[10px] text-brief-muted">{node.aliases.join(' · ')}</span>
                        ) : null}
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-1.5 text-xs text-brief-muted">일치하는 인물 없음</li>
                )}
              </ul>
            ) : null}
          </div>
        </div>
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
                  className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                    isOpen ? 'border-brief-accent bg-brief-accent-soft' : 'border-brief-rule bg-white'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-dashSerif text-sm font-bold text-brief-ink">{node.name}</span>
                    {node.aliases.length > 0 ? (
                      <span className="text-[11px] text-brief-muted">{node.aliases.join(' · ')}</span>
                    ) : null}
                  </div>
                  {isOpen && relations.length > 0 ? (
                    <ul aria-label="관계" className="mt-2.5 flex flex-wrap gap-1.5 border-t border-dashed border-brief-rule pt-2.5">
                      {relations.map((rel) => (
                        <li
                          key={rel.key}
                          className="rounded-full bg-brief-accent-soft px-2 py-1 text-[11px] text-brief-accent"
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
