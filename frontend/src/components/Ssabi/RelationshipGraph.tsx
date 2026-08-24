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

// 2026-08-25 — "글씨가 작다"(1차) → 14/12로 올렸는데 "꽤 더 키워야" 재요청, 그 다음
// "관계 글자는 이름보다 작아도 된다"는 재조정 요청까지 세 차례 거쳤다. CHAR_PX(글자당
// 너비 어림)를 매번 감으로 골랐던 게 문제였다 — 실제 렌더된 <text>의
// getComputedTextLength()를 재보니(2026-08-25, 실데이터 인물명·관계 라벨로 측정)
// 한글 글자 너비는 글꼴 크기의 약 0.94배로 거의 일정했다. 매번 새 폰트 크기마다
// CHAR_PX를 따로 어림하지 않도록 폰트 크기에서 직접 계산한다 — 그래야 "관계 라벨이
// 감싸는 프레임 밖으로 튀어나온다"(CHAR_PX가 실제보다 작아 라벨 박스가 좁게
// 잡혔던 것) 같은 계산-실측 어긋남이 다시 안 생긴다.
const KOREAN_CHAR_WIDTH_RATIO = 0.94;
const NAME_FONT_PX = 17;
const NAME_CHAR_PX = NAME_FONT_PX * KOREAN_CHAR_WIDTH_RATIO;
// 관계 라벨은 이름보다 한 단계 작게 — 인물명이 우선이라는 위계를 글자 크기로도 드러낸다.
const EDGE_LABEL_FONT_PX = 12;
const EDGE_LABEL_CHAR_PX = EDGE_LABEL_FONT_PX * KOREAN_CHAR_WIDTH_RATIO;
const MIN_ZOOM_RATIO = 0.32;
const MAX_ZOOM_RATIO = 2.4;
// clampViewBox 의 팬 여유는 (1 + 2*PAN_MARGIN_RATIO)*base.width 까지만 뷰박스를 허용한다.
// 이 값이 MAX_ZOOM_RATIO 보다 작으면 최대 축소 근처에서 팬 가능 범위가 한 점으로
// 쪼그라들어 드래그가 전혀 안 먹는다(실기기 확인, 2026-08-24) — 0.35였을 때 한계가
// 1.7이라 2.4까지 축소가 가능한 것과 충돌했다. 축소 한계(2.4)를 넉넉히 덮도록 올린다.
const PAN_MARGIN_RATIO = 0.9;
/** 포커스 확대 시 선택 인물·인접 인물 범위 바깥에 남기는 여유(라벨이 잘리지 않을 만큼) */
const FOCUS_PADDING = 90;

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

  const neighborIds = useMemo(() => {
    if (!validSelectedId) return new Set<string>();
    const ids = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.source === validSelectedId) ids.add(edge.target);
      if (edge.target === validSelectedId) ids.add(edge.source);
    }
    return ids;
  }, [validSelectedId, graph.edges]);

  // 선택하면 그 인물 + 인접 인물이 보이는 범위로 중앙 이동·확대한다(2026-08-25 —
  // 예전엔 화면 밖일 때만 팬하고 확대율은 그대로 뒀는데, "포커싱될 때 중심 이동 +
  // 적절한 확대"를 요청받아 항상 재조정한다. 인접 인물이 없으면(고립 노드) 선택
  // 인물 하나만 감쌀 여유만큼만 확대한다.
  useEffect(() => {
    if (!validSelectedId) return;
    const idx = graph.nodes.findIndex((n) => n.id === validSelectedId);
    if (idx < 0) return;
    const p = positions[idx];
    const neighborPositions = graph.nodes
      .map((n, i) => (neighborIds.has(n.id) ? positions[i] : null))
      .filter((q): q is Point => q !== null);
    // 뷰박스 중심은 p(선택 인물) 고정이다 — "해당 인물을 중심으로" 요청 그대로. 그래서
    // 필요한 반너비는 "인접 인물들 사이의 전체 span"이 아니라 **p로부터 가장 먼 인접
    // 인물까지의 거리**여야 한다. p가 인접 인물 무리의 한쪽으로 치우쳐 있으면(흔한 경우 —
    // 인접 인물들이 p 기준 한 방향에 몰려 있을 수 있다) 전체 span의 절반만큼만 반너비를
    // 잡으면 반대쪽 먼 인접 인물이 화면 밖으로 잘린다(2026-08-25, "주변 인물이 잘린다"
    // 피드백의 실제 원인 — p를 중심으로 대칭 확장하는데 필요한 반경을 잘못 구했었다).
    const maxDx = Math.max(0, ...neighborPositions.map((q) => Math.abs(q.x - p.x)));
    const maxDy = Math.max(0, ...neighborPositions.map((q) => Math.abs(q.y - p.y)));
    const aspect = base.height / base.width;
    // clampViewBox가 height를 base의 가로세로비로 다시 계산한다. width 하나만 두 축 중
    // 큰 쪽으로 잡으면, 작은 쪽 축은 그 비율로 다시 계산된 height가 실제로 필요한 반경보다
    // 작아질 수 있다 — width를 두 축 모두를 여유 있게 덮는 값으로 따로 계산한다.
    const rawWidth = Math.max(
      maxDx * 2 + FOCUS_PADDING * 2,
      (maxDy * 2 + FOCUS_PADDING * 2) / aspect
    );
    const width = Math.max(base.width * MIN_ZOOM_RATIO, Math.min(base.width * MAX_ZOOM_RATIO, rawWidth));
    const height = width * aspect;
    setViewBox(clampViewBox({ x: p.x - width / 2, y: p.y - height / 2, width, height }, base));
  }, [validSelectedId, graph.nodes, positions, neighborIds, base]);

  // SVG는 기본적으로 preserveAspectRatio="xMidYMid meet" — 컨테이너와 viewBox의 가로세로비가
  // 다르면 더 좁게 맞아야 하는 쪽(폭 기준 배율 또는 높이 기준 배율 중 작은 쪽)에 맞춰 여백을
  // 두고 줄인다. 폭만 기준으로 unit을 구하면, 패널을 가로로 늘려 컨테이너가 viewBox보다
  // 상대적으로 넓어졌을 때 실제로는 높이가 배율을 결정하는데 폭 기준값을 쓰게 돼 글자·노드가
  // 실제보다 작게 계산됐다(2026-08-25, "가로로 늘리면 글씨가 작아진다" 피드백) — 두 축 모두
  // 계산해 더 큰 쪽(더 좁게 맞아야 하는 쪽)을 쓴다.
  const unit = () => {
    const el = wrapRef.current;
    const widthPx = el?.clientWidth || 1;
    const heightPx = el?.clientHeight || 1;
    return Math.max(viewBox.width / widthPx, viewBox.height / heightPx);
  };

  // 100%(fit) 상태 기준 k — 노드 원을 이 값 대비로 스케일해 "글자처럼" 화면상 크기를
  // 고정한다(아래 nodeScale 참고).
  const unit0 = () => {
    const el = wrapRef.current;
    const widthPx = el?.clientWidth || 1;
    const heightPx = el?.clientHeight || 1;
    return Math.max(base.width / widthPx, base.height / heightPx);
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
  // 노드 원 확대·축소 배율 — 축소(k > k0)하면 커지고 확대(k < k0)하면 작아져, 화면상
  // 크기가 100% 기준으로 항상 일정하게 유지된다. 라벨(NAME_FONT_PX*k)과 똑같은 원리다.
  // 이게 없으면(예전) 원은 순수 유닛값이라 축소할수록 점점 작아지는데 글자는 그대로라,
  // "축소하면 노드는 너무 작아지고 글씨는 너무 커 보인다"는 피드백(2026-08-25)의 원인이
  // 됐다 — 100% 기준에선 nodeScale이 1이라 지금까지 확정한 크기와 동일하게 보인다.
  const nodeScale = k / unit0();

  // 인물명 라벨 박스 — 겹치면 연결 수 적은 쪽을 숨긴다. 선택·인접 인물은 최우선.
  // 관계 라벨(아래)이 이 중 실제로 보이는 라벨과 안 겹치게 하려면 살아남은 박스
  // 자체가 필요하다 — id 집합만으론 위치·크기를 다시 못 얻는다.
  const nameLabelBoxes = useMemo(() => {
    const boxes: (LabelBox & { id: string })[] = graph.nodes.map((node, i) => {
      const p = positions[i];
      const r = nodeRadius(degree.get(node.id) ?? 0) * nodeScale;
      const width = estimateTextWidth(node.name, NAME_CHAR_PX * k) + 4 * k;
      const height = (NAME_FONT_PX + 4) * k;
      const isSelected = node.id === validSelectedId;
      const isNeighbor = neighborIds.has(node.id);
      return {
        id: node.id,
        x: p.x - width / 2,
        y: p.y + r,
        width,
        height,
        priority: (degree.get(node.id) ?? 0) + (isSelected ? 9999 : 0) + (isNeighbor ? 500 : 0),
      };
    });
    return pickNonOverlapping(boxes);
    // k(줌 배율)가 바뀌면 라벨 크기가 바뀌어 충돌 여부도 바뀐다
  }, [graph.nodes, positions, degree, validSelectedId, neighborIds, k, nodeScale]);

  const nameLabels = useMemo(
    () => new Set(nameLabelBoxes.map((b) => b.id)),
    [nameLabelBoxes]
  );

  /**
   * 관계 라벨 — 선택된 인물과 닿은 간선에서만. 참고 시안(reader-map-graph.html
   * relayout())과 같은 규칙: 실제로 보이는 인물명 라벨은 항상 이긴다(우선순위
   * 무한대로 블로커 취급), 관계 라벨끼리는 간선이 긴 쪽이 우선(짧은 간선끼리
   * 몰린 라벨이 더 잘 겹치므로). 예전엔 이 겹침 회피가 전혀 없어서 연결이 많은
   * 인물을 선택하면 라벨이 죄다 겹쳐 보였다(2026-08-25 피드백).
   */
  const edgeLabels = useMemo(() => {
    if (!validSelectedId) return [];
    const indexOf = new Map(graph.nodes.map((n, i) => [n.id, i]));
    const candidates = graph.edges
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
        return { key: `${edge.source}-${edge.target}`, label: edge.label, cx, cy, width, height, len };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const blockerBoxes = nameLabelBoxes.map((b) => ({ ...b, key: `name:${b.id}`, priority: Infinity }));
    const edgeBoxes = candidates.map((c) => ({
      key: c.key,
      x: c.cx - c.width / 2,
      y: c.cy - c.height / 2,
      width: c.width,
      height: c.height,
      priority: c.len,
    }));
    const kept = new Set(pickNonOverlapping([...blockerBoxes, ...edgeBoxes]).map((b) => b.key));
    return candidates.filter((c) => kept.has(c.key));
  }, [validSelectedId, graph.nodes, graph.edges, positions, k, nameLabelBoxes]);

  return (
    <div
      ref={wrapRef}
      // 높이를 고정값(h-[280px])으로 두면 패널을 가로로 늘려도(usePanelResize) 세로는
      // 그대로라 그래프 영역이 점점 옆으로 길쭉해졌다(2026-08-25, "늘리면 가로로만
      // 늘어난다" 피드백). 그래프 내용(base)의 가로세로비로 aspect-ratio를 잡아 폭이
      // 늘면 높이도 같이 늘게 한다 — min/max로 극단적인 비율(인물이 한 줄로 쭉 이어진
      // 그래프 등)에서도 너무 짜부라지거나 과하게 늘어나지 않게 막는다.
      className="relative w-full min-h-[220px] max-h-[420px] touch-none overflow-hidden rounded-xl border border-brief-rule bg-white"
      style={{ aspectRatio: `${base.width} / ${base.height}` }}
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
                className={touches ? 'stroke-brief-accent' : 'stroke-brief-rule'}
                strokeWidth={(touches ? 2.4 : 1.2) * k}
                // 실데이터(간선 54개, 핵심 인물군에 몰림)로 확인: 선택 전 기본 상태에서
                // 전부 opacity 1이면 얽힌 간선이 서로 겹쳐 빽빽해 보인다("선이 겹치고
                // 빽빽해 보인다" 피드백, 2026-08-25). 아무것도 선택 안 했을 때도 옅게
                // 낮춰 겹치는 선끼리 서로 잡아먹는 인상을 줄인다 — 선택하면 그대로 1로
                // 돌아온다(반대편 dimmed 분기는 원래도 0.15).
                opacity={dimmed ? 0.15 : validSelectedId ? 1 : 0.55}
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
                className="fill-white stroke-brief-accent/40"
              />
              <text
                x={label.cx}
                y={label.cy + label.height / 2 - 2.6 * k}
                textAnchor="middle"
                className="fill-brief-accent font-dashSans"
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
            const r = nodeRadius(degree.get(node.id) ?? 0) * nodeScale;
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
                  className={`${isSelected ? 'fill-brief-accent' : 'fill-brief-ink/45'} ${isNeighbor ? 'stroke-brief-accent' : ''}`}
                  strokeWidth={isNeighbor ? 2.8 * k : 0}
                />
                {nameLabels.has(node.id) ? (
                  <text
                    x={p.x}
                    y={p.y + r + NAME_FONT_PX * k + 2 * k}
                    textAnchor="middle"
                    className="fill-brief-ink stroke-white font-dashSerif font-semibold"
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
          className="flex h-7 w-7 items-center justify-center rounded-full border border-brief-rule bg-white/95 text-brief-muted"
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
          className="flex h-7 w-7 items-center justify-center rounded-full border border-brief-rule bg-white/95 text-brief-muted"
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
          className="flex h-7 w-7 items-center justify-center rounded-full border border-brief-rule bg-white/95 text-[11px] text-brief-muted"
          onClick={fitView}
        >
          ⤢
        </button>
      </div>

      {/* 시안(reader-map-graph.html)의 .scalebar 그대로 — 확대율 표시. base/viewBox 비율만 쓰므로 새 데이터 없이 되는 순수 표시값 */}
      <span className="absolute bottom-2 left-2 rounded-pill border border-brief-rule bg-white/90 px-2 py-0.5 text-[10px] text-brief-muted">
        {Math.round((base.width / viewBox.width) * 100)}%
      </span>
    </div>
  );
}
