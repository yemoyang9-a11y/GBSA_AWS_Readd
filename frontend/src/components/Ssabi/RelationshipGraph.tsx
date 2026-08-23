import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphResponse } from '../../types';
import {
  boundingBox,
  computeDegrees,
  estimateTextWidth,
  forceLayout,
  nodeRadius,
  pickNonOverlapping,
  type BoundingBox,
  type LabelBox,
  type Point,
} from './graphLayout';

/**
 * 관계도 그래프 렌더 — 지도형 리디자인 (2026-08-24)
 *
 * 시안 `docs-local/reader-map-graph.html`의 상호작용(줌/팬/핀치, 노드 클릭 선택,
 * 라벨 충돌회피)을 이 저장소의 디자인 톤(Tailwind 토큰)으로 그린다 — **디자인은 R4
 * 기존 구성이 우선이고, 목업에서는 구조·인터랙션만 가져온다.** 목업 CSS의 원색(cream/
 * terra 계열)은 옮기지 않는다 — 이미 R4 토큰(ssabi/ink/muted/line)이 비슷한 색감이다.
 *
 * React Flow → 순수 SVG로 교체했다. 좌표는 graphLayout.ts 의 힘-분산 배치(무작위성 없음,
 * 같은 입력엔 항상 같은 좌표)로 만든다.
 *
 * ⚠️ 여기서 노드·간선을 걸러내지 않는다. 서버가 이미 기준점 이하로 필터해 내려보냈고,
 *    초과 여부를 판별하는 코드를 프론트에 두지 않는다 (절대 규칙 7번).
 *
 * ## 선택 상태는 이 컴포넌트가 소유하지 않는다
 *
 * `selectedId`/`onSelect`로 부모(RelationshipTab)가 선택 상태를 갖는다 — 추후 "본문에서
 * 인물명 선택 시 관계도 포커싱" 기능이 이 자리에 그대로 꽂힐 수 있어야 한다(같은
 * setSelected를 본문 클릭 핸들러가 호출하면 된다). 이 컴포넌트는 selectedId를 받아
 * 그리기만 한다.
 *
 * 인물명 라벨은 항상 전부 그리려 하고, 겹치면 연결 수가 적은 쪽을 숨긴다(선택·인접
 * 인물은 최우선 유지). 관계 라벨은 선택된 인물과 닿은 간선에서만 보여준다 — 예전엔
 * 간선 51개에서 캔버스 라벨을 통째로 생략했는데(2026-08-21 polish), 이제 선택 시에만
 * 보여주는 쪽이 더 낫다. 항상 보이는 "관계" 텍스트 목록은 RelationshipTab이 맡는다.
 */

const NAME_FONT_PX = 12;
const NAME_CHAR_PX = 6.4;
const EDGE_LABEL_FONT_PX = 10.5;
const EDGE_LABEL_CHAR_PX = 6.6;
const MIN_ZOOM_RATIO = 0.32;
const MAX_ZOOM_RATIO = 2.4;
const PAN_MARGIN_RATIO = 0.35;

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampViewBox(vb: ViewBox, base: BoundingBox): ViewBox {
  const minW = base.width * MIN_ZOOM_RATIO;
  const maxW = base.width * MAX_ZOOM_RATIO;
  const width = Math.max(minW, Math.min(maxW, vb.width));
  const height = width * (base.height / base.width);

  const marginX = base.width * PAN_MARGIN_RATIO;
  const marginY = base.height * PAN_MARGIN_RATIO;
  const x = Math.max(base.x - marginX, Math.min(base.x + base.width + marginX - width, vb.x));
  const y = Math.max(base.y - marginY, Math.min(base.y + base.height + marginY - height, vb.y));

  return { x, y, width, height };
}

export default function RelationshipGraph({
  graph,
  selectedId,
  onSelect,
}: {
  graph: GraphResponse;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointers: Map<number, Point>; last: Point | null; pinchDist: number | null; moved: number }>({
    pointers: new Map(),
    last: null,
    pinchDist: null,
    moved: 0,
  });

  const degree = useMemo(() => computeDegrees(graph.nodes, graph.edges), [graph.nodes, graph.edges]);
  const positions = useMemo(() => forceLayout(graph.nodes, graph.edges), [graph.nodes, graph.edges]);
  const base = useMemo(() => boundingBox(positions), [positions]);

  const [viewBox, setViewBox] = useState<ViewBox>(() => ({
    x: base.x,
    y: base.y,
    width: base.width,
    height: base.height,
  }));

  // 그래프가 바뀌면(되감기·페이지 진행) 그 그래프의 배치로 다시 fit — 이전 줌 위치를
  // 새 좌표계에 그대로 들고 있으면 화면 밖을 보게 된다.
  //
  // ⚠️ 처음엔 "중심 인물로 확대"를 시도했다(목업의 focusDefault()를 그대로 옮김) —
  //    목업은 인물 30명 규모에 맞춘 고정 캔버스라 확대가 자연스러웠지만, 여기 base는
  //    그래프 크기에 맞춰 매번 다시 계산되는 값이라 인물이 몇 명 안 될 때(예: 첫 진입
  //    직후) 확대하면 나머지 인물이 통째로 화면 밖으로 잘려 나갔다(스크린샷으로 확인).
  //    전체를 우선 보여주고, 확대는 사용자가 노드를 선택했을 때(아래 effect)만 한다.
  useEffect(() => {
    setViewBox({ x: base.x, y: base.y, width: base.width, height: base.height });
  }, [base]);

  const validSelectedId = selectedId && degree.has(selectedId) ? selectedId : null;

  // 선택한 인물이 화면 밖이면 부드럽게 중앙으로(확대율 유지) — 목업의 select() 동작
  useEffect(() => {
    if (!validSelectedId) return;
    const idx = graph.nodes.findIndex((n) => n.id === validSelectedId);
    if (idx < 0) return;
    const p = positions[idx];
    setViewBox((vb) => {
      if (p.x >= vb.x && p.x <= vb.x + vb.width && p.y >= vb.y && p.y <= vb.y + vb.height) {
        return vb;
      }
      return clampViewBox({ x: p.x - vb.width / 2, y: p.y - vb.height / 2, width: vb.width, height: vb.height }, base);
    });
  }, [validSelectedId, graph.nodes, positions, base]);

  const neighborIds = useMemo(() => {
    if (!validSelectedId) return new Set<string>();
    const ids = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.source === validSelectedId) ids.add(edge.target);
      if (edge.target === validSelectedId) ids.add(edge.source);
    }
    return ids;
  }, [validSelectedId, graph.edges]);

  const unit = () => {
    const px = wrapRef.current?.clientWidth || 1;
    return viewBox.width / px;
  };

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setViewBox((vb) => {
      const ux = vb.x + ((clientX - rect.left) / rect.width) * vb.width;
      const uy = vb.y + ((clientY - rect.top) / rect.height) * vb.height;
      const rawWidth = vb.width / factor;
      const width = Math.max(base.width * MIN_ZOOM_RATIO, Math.min(base.width * MAX_ZOOM_RATIO, rawWidth));
      const k = width / vb.width;
      return clampViewBox(
        { x: ux - (ux - vb.x) * k, y: uy - (uy - vb.y) * k, width, height: vb.height * k },
        base
      );
    });
  }

  // 네이티브 리스너로 직접 붙인다 — React 17+ 는 onWheel 합성 이벤트를 passive로
  // 등록해서 그 안에서 preventDefault()를 불러도 실제로는 막히지 않는다(콘솔 경고만
  // 뜨고 페이지가 같이 스크롤된다). 줌 도중 배경 스크롤을 막으려면 이 방법뿐이다.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.14 : 1 / 1.14);
    }
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('[data-graph-zoom-control]')) return;
    const drag = dragRef.current;
    drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    drag.moved = 0;
    if (drag.pointers.size === 1) {
      drag.last = { x: event.clientX, y: event.clientY };
    } else if (drag.pointers.size === 2) {
      const pts = [...drag.pointers.values()];
      drag.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  }

  // 포인터 캡처를 쓰지 않는다 — 캡처하면 드래그 중 손가락이 노드 위를 지나가도 그
  // 노드의 클릭 이벤트가 죽는다. window 에서 추적해야 클릭이 살아 있다.
  useEffect(() => {
    function handleMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag.pointers.has(event.pointerId)) return;
      drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (drag.pointers.size === 2 && drag.pinchDist !== null) {
        const pts = [...drag.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (drag.pinchDist > 0) {
          zoomAt((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, dist / drag.pinchDist);
        }
        drag.pinchDist = dist;
        drag.moved = 99;
        return;
      }

      if (drag.pointers.size === 1 && drag.last) {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = ((event.clientX - drag.last.x) / rect.width) * viewBox.width;
        const dy = ((event.clientY - drag.last.y) / rect.height) * viewBox.height;
        drag.moved += Math.abs(event.clientX - drag.last.x) + Math.abs(event.clientY - drag.last.y);
        if (drag.moved > 4) {
          setViewBox((vb) => clampViewBox({ ...vb, x: vb.x - dx, y: vb.y - dy }, base));
        }
        drag.last = { x: event.clientX, y: event.clientY };
      }
    }
    function handleUp(event: PointerEvent) {
      const drag = dragRef.current;
      drag.pointers.delete(event.pointerId);
      if (drag.pointers.size < 2) drag.pinchDist = null;
      if (drag.pointers.size === 0) drag.last = null;
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
    // base 는 그래프가 바뀔 때만 바뀌고, viewBox 는 최신값을 클로저로 매번 새로 잡아야
    // 팬 델타 계산이 어긋나지 않는다.
  }, [base, viewBox.width, viewBox.height]);

  function wasDragged() {
    return dragRef.current.moved > 6;
  }

  function handleNodeClick(id: string) {
    if (wasDragged()) return;
    onSelect(validSelectedId === id ? null : id);
  }

  function fitView() {
    setViewBox({ x: base.x, y: base.y, width: base.width, height: base.height });
  }

  // 컨테이너 크기가 바뀌면(창 크기·반응형 레이아웃) k(줌 배율)도 다시 계산해야
  // 폰트·선 굵기가 화면상 크기를 유지한다 — viewBox 값 자체는 안 바꾸고 재렌더만 강제한다
  useEffect(() => {
    function handleResize() {
      setViewBox((vb) => ({ ...vb }));
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const k = unit();

  // 인물명 라벨 — 겹치면 연결 수 적은 쪽을 숨긴다. 선택·인접 인물은 최우선.
  const nameLabels = useMemo(() => {
    const boxes: (LabelBox & { id: string; label: Point })[] = graph.nodes.map((node, i) => {
      const p = positions[i];
      const r = nodeRadius(degree.get(node.id) ?? 0);
      const width = estimateTextWidth(node.name, NAME_CHAR_PX * k) + 4 * k;
      const height = (NAME_FONT_PX + 4) * k;
      const isSelected = node.id === validSelectedId;
      const isNeighbor = neighborIds.has(node.id);
      return {
        id: node.id,
        label: { x: p.x, y: p.y + r + NAME_FONT_PX * k + 2 * k },
        x: p.x - width / 2,
        y: p.y + r,
        width,
        height,
        priority: (degree.get(node.id) ?? 0) + (isSelected ? 9999 : 0) + (isNeighbor ? 500 : 0),
      };
    });
    return new Set(pickNonOverlapping(boxes).map((b) => b.id));
    // k(줌 배율)가 바뀌면 라벨 크기가 바뀌어 충돌 여부도 바뀐다
  }, [graph.nodes, positions, degree, validSelectedId, neighborIds, k]);

  // 관계 라벨 — 선택된 인물과 닿은 간선에서만
  const edgeLabels = useMemo(() => {
    if (!validSelectedId) return [];
    const indexOf = new Map(graph.nodes.map((n, i) => [n.id, i]));
    return graph.edges
      .filter((edge) => edge.source === validSelectedId || edge.target === validSelectedId)
      .map((edge) => {
        const fromSelected = edge.source === validSelectedId;
        const nearIdx = indexOf.get(fromSelected ? edge.source : edge.target);
        const farIdx = indexOf.get(fromSelected ? edge.target : edge.source);
        if (nearIdx === undefined || farIdx === undefined) return null;
        const near = positions[nearIdx];
        const far = positions[farIdx];
        const dx = far.x - near.x;
        const dy = far.y - near.y;
        const len = Math.hypot(dx, dy) || 1;
        const width = estimateTextWidth(edge.label, EDGE_LABEL_CHAR_PX * k) + 10 * k;
        const height = (EDGE_LABEL_FONT_PX + 7) * k;
        const dist = Math.max(26 * k, Math.min(len * 0.62, len - 22 * k));
        const cx = near.x + (dx / len) * dist;
        const cy = near.y + (dy / len) * dist;
        return { key: `${edge.source}-${edge.target}`, label: edge.label, cx, cy, width, height };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [validSelectedId, graph.nodes, graph.edges, positions, k]);

  return (
    <div
      ref={wrapRef}
      className="relative h-[280px] w-full touch-none overflow-hidden rounded-card border border-line bg-canvas"
      onPointerDown={handlePointerDown}
    >
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onClick={(event) => {
          if (wasDragged()) return;
          if (!(event.target as SVGElement).closest('[data-node-id]')) onSelect(null);
        }}
      >
        <g>
          {graph.edges.map((edge) => {
            const sIdx = graph.nodes.findIndex((n) => n.id === edge.source);
            const tIdx = graph.nodes.findIndex((n) => n.id === edge.target);
            if (sIdx < 0 || tIdx < 0) return null;
            const touches = validSelectedId === edge.source || validSelectedId === edge.target;
            const dimmed = validSelectedId !== null && !touches;
            return (
              <line
                key={`${edge.source}-${edge.target}`}
                x1={positions[sIdx].x}
                y1={positions[sIdx].y}
                x2={positions[tIdx].x}
                y2={positions[tIdx].y}
                className={touches ? 'stroke-ssabi' : 'stroke-line'}
                strokeWidth={(touches ? 2.4 : 1.2) * k}
                opacity={dimmed ? 0.15 : 1}
              />
            );
          })}
        </g>

        <g>
          {edgeLabels.map((label) => (
            <g key={label.key} pointerEvents="none">
              <rect
                x={label.cx - label.width / 2}
                y={label.cy - label.height / 2}
                width={label.width}
                height={label.height}
                rx={label.height / 2}
                className="fill-canvas stroke-ssabi/40"
              />
              <text
                x={label.cx}
                y={label.cy + label.height / 2 - 2.6 * k}
                textAnchor="middle"
                className="fill-ssabi font-sans"
                style={{ fontSize: EDGE_LABEL_FONT_PX * k }}
              >
                {label.label}
              </text>
            </g>
          ))}
        </g>

        <g>
          {graph.nodes.map((node, i) => {
            const p = positions[i];
            const r = nodeRadius(degree.get(node.id) ?? 0);
            const isSelected = node.id === validSelectedId;
            const isNeighbor = neighborIds.has(node.id);
            const dimmed = validSelectedId !== null && !isSelected && !isNeighbor;
            return (
              <g
                key={node.id}
                data-node-id={node.id}
                tabIndex={0}
                role="button"
                aria-label={node.name}
                aria-pressed={isSelected}
                onClick={(event) => {
                  event.stopPropagation();
                  handleNodeClick(node.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleNodeClick(node.id);
                  }
                }}
                className="cursor-pointer outline-none"
                opacity={dimmed ? 0.2 : 1}
              >
                <circle cx={p.x} cy={p.y} r={r + 13 * k} fill="transparent" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  className={`${isSelected ? 'fill-ssabi' : 'fill-ink/45'} ${isNeighbor ? 'stroke-ssabi' : ''}`}
                  strokeWidth={isNeighbor ? 2.8 * k : 0}
                />
                {nameLabels.has(node.id) ? (
                  <text
                    x={p.x}
                    y={p.y + r + NAME_FONT_PX * k + 2 * k}
                    textAnchor="middle"
                    className="fill-ink stroke-canvas font-serif font-semibold"
                    style={{
                      fontSize: NAME_FONT_PX * k,
                      paintOrder: 'stroke',
                      strokeWidth: 3 * k,
                      strokeLinejoin: 'round',
                    }}
                  >
                    {node.name}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1.5" data-graph-zoom-control>
        <button
          type="button"
          aria-label="확대"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface/95 text-muted"
          onClick={() => {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.35);
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="축소"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface/95 text-muted"
          onClick={() => {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.35);
          }}
        >
          −
        </button>
        <button
          type="button"
          aria-label="전체 보기"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface/95 text-[11px] text-muted"
          onClick={fitView}
        >
          ⤢
        </button>
      </div>
    </div>
  );
}
