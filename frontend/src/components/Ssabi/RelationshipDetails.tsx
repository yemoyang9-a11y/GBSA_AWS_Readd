import type { GraphEdge, GraphNode, RelationshipEvidence } from '../../types';

const assertionLabels = {
  fact: '서술된 사실',
  belief: '인물의 생각',
  claim: '주장',
  rumor: '소문',
  uncertain: '불확실',
  negated: '부정된 관계',
};

function Evidence({
  evidence,
  changed = false,
}: {
  evidence: RelationshipEvidence;
  changed?: boolean;
}) {
  // FR-SPL-002 🚦: 근거의 선택은 서버에서 완료된다. 여기서 원문을 추가 조회하지 않는다.
  return (
    <details className="mt-2 text-[11px] text-brief-muted">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold text-brief-accent lg:min-h-0 lg:py-2">
        {changed ? '변경 근거' : '근거 보기'} · {evidence.source_page}p
      </summary>
      <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 border-brief-rule pl-3 leading-relaxed">
        {evidence.quote}
      </blockquote>
    </details>
  );
}

export default function RelationshipDetails({
  edge,
  nodes,
  selectedId,
}: {
  edge: GraphEdge;
  nodes: readonly GraphNode[];
  selectedId: string;
}) {
  const semantics = edge.semantics;
  const name = (id: string) => nodes.find((node) => node.id === id)?.name ?? id;
  const a = name(edge.source);
  const b = name(edge.target);
  if (!semantics) {
    const other = name(edge.source === selectedId ? edge.target : edge.source);
    return (
      <>
        <p className="font-semibold text-brief-ink">
          {other} · {edge.label}
        </p>
        <p className="mt-1 text-brief-muted">방향 미검증</p>
      </>
    );
  }
  const direction =
    semantics.direction === 'a_to_b'
      ? `${a} → ${b}`
      : semantics.direction === 'b_to_a'
        ? `${b} → ${a}`
        : semantics.direction === 'mutual'
          ? `${a} ↔ ${b}`
          : `${a} — ${b}`;
  const badges = [assertionLabels[semantics.assertion_status]];
  if (semantics.direction === 'unknown') badges.push('방향 미확인');
  if (semantics.temporal_scope === 'event') badges.push('사건');
  if (semantics.state === 'ended') badges.push('종료');
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-semibold text-brief-ink">
        <span>{direction}</span>
        <span className="text-brief-accent">{edge.label}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {badges.map((badge) => (
          <span
            key={badge}
            className="rounded-full bg-brief-accent-soft px-2 py-0.5 text-brief-accent"
          >
            {badge}
          </span>
        ))}
        <span className="py-0.5 text-brief-muted">{edge.established_page}p</span>
      </div>
      <p className="mt-2 break-words text-xs leading-relaxed text-brief-ink">{semantics.summary}</p>
      {semantics.attribution ? (
        <p className="mt-1 text-brief-muted">전달·판단 주체: {semantics.attribution}</p>
      ) : null}
      <Evidence evidence={semantics.evidence} />
      {semantics.change_evidence ? <Evidence evidence={semantics.change_evidence} changed /> : null}
    </>
  );
}
