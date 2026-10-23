import type { GraphEdge, Relationship } from '../../shared/types';

/** FR-CHR-001: a pair can carry independent attitudes and facts at the same time. */
export function relationshipTrack(row: Relationship): string {
  const pair = [row.character_a_id, row.character_b_id].sort();
  const s = row.semantics;
  if (!s) return JSON.stringify([...pair, 'legacy']);
  const reversed = row.character_a_id !== pair[0];
  const direction =
    reversed && s.direction === 'a_to_b'
      ? 'b_to_a'
      : reversed && s.direction === 'b_to_a'
        ? 'a_to_b'
        : s.direction;
  return JSON.stringify([
    ...pair,
    direction,
    s.kind,
    s.relation_key,
    s.temporal_scope === 'event' ? row.id : 'ongoing',
  ]);
}

/** Only accepts already cutoff-bounded records. Never loads a future version to infer an end. */
export function latestRelationshipVersions(rows: Relationship[]): Relationship[] {
  const tracks = new Map<string, Relationship>();
  for (const row of rows) {
    const key = relationshipTrack(row);
    const previous = tracks.get(key);
    if (
      !previous ||
      row.established_page > previous.established_page ||
      (row.established_page === previous.established_page && row.id > previous.id)
    )
      tracks.set(key, row);
  }
  return [...tracks.values()];
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
