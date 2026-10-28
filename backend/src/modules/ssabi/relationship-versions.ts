import type { GraphEdge, Relationship, RelationshipSemantics } from '../../shared/types';

/** 배치(AccumulatedRelationship)와 런타임(Relationship)이 공유하는 최소 형태 */
export interface VersionedRelationship {
  id?: string;
  character_a_id: string;
  character_b_id: string;
  established_page: number;
  semantics?: RelationshipSemantics | null;
}

type Slot = 'a' | 'b';

/** 저장 순서와 무관하게 정렬된 두 인물과, 그 정렬에 맞춘 방향 */
function normalized(row: VersionedRelationship) {
  const pair = [row.character_a_id, row.character_b_id].sort();
  const direction = row.semantics?.direction;
  const reversed = row.character_a_id !== pair[0];
  return {
    pair,
    direction:
      reversed && direction === 'a_to_b'
        ? 'b_to_a'
        : reversed && direction === 'b_to_a'
          ? 'a_to_b'
          : direction,
  };
}

/**
 * FR-CHR-001: 서로 대체할 수 있는 관계의 묶음. 방향은 묶음 키가 아니라 그 안의 관점 칸이다.
 * 같은 두 인물 사이에서도 가족·고용·감정은 각자 묶음이고, 사건은 근거 위치마다 따로다.
 */
export function relationshipGroup(row: VersionedRelationship): string {
  const { pair } = normalized(row);
  const s = row.semantics;
  if (!s) return JSON.stringify([...pair, 'legacy']);
  return JSON.stringify([
    ...pair,
    s.kind,
    s.relation_key,
    s.temporal_scope === 'event'
      ? [row.established_page, s.evidence.start_char, s.evidence.end_char]
      : 'ongoing',
  ]);
}

/** 한쪽 방향은 그 관계를 가진 쪽 칸만, 쌍방·무방향·미확인·기존 행은 양쪽 칸을 차지한다 */
export function relationshipSlots(row: VersionedRelationship): Slot[] {
  const { direction } = normalized(row);
  return direction === 'a_to_b' ? ['a'] : direction === 'b_to_a' ? ['b'] : ['a', 'b'];
}

/** 정렬된 두 인물 기준의 방향 — 저장 순서가 다른 행끼리 비교할 때 쓴다 */
export function normalizedDirection(row: VersionedRelationship): string | undefined {
  return normalized(row).direction;
}

/**
 * FR-CHR-001: 묶음마다 페이지 순서로 칸을 채운다. 칸을 하나라도 빼앗긴 관계는 통째로 대체된다 —
 * 한쪽→쌍방, 쌍방→한쪽, 미확인→확정 모두 새 관계만 남고, A→B와 B→A는 칸이 달라 함께 남는다.
 * 같은 페이지면 id가 큰 쪽이 나중이다. 기준점으로 이미 잘린 행만 받는다 — 미래 행으로 끝을 추론하지 않는다.
 */
export function currentRelationshipVersions<T extends VersionedRelationship>(rows: T[]): T[] {
  const ordered = [...rows].sort(
    (x, y) =>
      x.established_page - y.established_page ||
      ((x.id ?? '') < (y.id ?? '') ? -1 : (x.id ?? '') > (y.id ?? '') ? 1 : 0)
  );
  const groups = new Map<string, Map<Slot, T>>();
  for (const row of ordered) {
    const key = relationshipGroup(row);
    const slots = groups.get(key) ?? new Map<Slot, T>();
    groups.set(key, slots);
    for (const slot of relationshipSlots(row)) {
      const replaced = slots.get(slot);
      if (replaced) for (const [s, r] of [...slots]) if (r === replaced) slots.delete(s);
    }
    for (const slot of relationshipSlots(row)) slots.set(slot, row);
  }
  const current = new Set([...groups.values()].flatMap((slots) => [...slots.values()]));
  return ordered.filter((row) => current.has(row));
}

/** Only accepts already cutoff-bounded records. Never loads a future version to infer an end. */
export function latestRelationshipVersions(rows: Relationship[]): Relationship[] {
  return currentRelationshipVersions(rows);
}

export function relationshipToEdge(row: Relationship): GraphEdge {
  return {
    id: row.id,
    source: row.character_a_id,
    target: row.character_b_id,
    label: row.label,
    established_page: row.established_page,
    ...(row.semantics ? { semantics: row.semantics } : {}),
  };
}
