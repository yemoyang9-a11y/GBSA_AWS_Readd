-- FR-CHR-001/R4: legacy endpoint ordering is not relationship direction.
-- Do not infer or backfill semantics from label/UUID order; legacy rows remain explicitly unverified.
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS semantics JSONB;
-- R12: a label-only approval cannot authorize changed direction/meaning/evidence.
ALTER TABLE review_records ADD COLUMN IF NOT EXISTS relationship_snapshot JSONB;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relationships_semantics_v2') THEN
    ALTER TABLE relationships ADD CONSTRAINT relationships_semantics_v2 CHECK (
      semantics IS NULL OR ((
        jsonb_typeof(semantics) = 'object'
        AND semantics @> '{"version":2}'::jsonb
        AND semantics ?& ARRAY['direction','kind','relation_key','summary','assertion_status','temporal_scope','state','evidence']
        AND semantics->>'direction' IN ('a_to_b','b_to_a','mutual','undirected','unknown')
        AND semantics->>'kind' IN ('family','social','emotion','action')
        AND semantics->>'assertion_status' IN ('fact','belief','claim','rumor','uncertain','negated')
        AND semantics->>'temporal_scope' IN ('ongoing','event')
        AND semantics->>'state' IN ('active','ended')
        AND length(trim(semantics->>'relation_key')) > 0
        AND length(trim(semantics->>'summary')) > 0
        AND jsonb_typeof(semantics->'evidence') = 'object'
        AND semantics->'evidence' ?& ARRAY['source_page','quote','start_char','end_char']
        AND (semantics #>> '{evidence,source_page}') ~ '^[1-9][0-9]*$'
        AND (semantics #>> '{evidence,source_page}')::numeric <= established_page
        AND length(trim(semantics #>> '{evidence,quote}')) > 0
        AND (semantics #>> '{evidence,start_char}') ~ '^[0-9]+$'
        AND (semantics #>> '{evidence,end_char}') ~ '^[0-9]+$'
        AND (semantics #>> '{evidence,end_char}')::numeric > (semantics #>> '{evidence,start_char}')::numeric
        AND (NOT semantics ? 'change_evidence' OR (
          jsonb_typeof(semantics->'change_evidence') = 'object'
          AND semantics->'change_evidence' ?& ARRAY['source_page','quote','start_char','end_char']
          AND (semantics #>> '{change_evidence,source_page}') ~ '^[1-9][0-9]*$'
          AND (semantics #>> '{change_evidence,source_page}')::numeric <= established_page
          AND length(trim(semantics #>> '{change_evidence,quote}')) > 0
          AND (semantics #>> '{change_evidence,start_char}') ~ '^[0-9]+$'
          AND (semantics #>> '{change_evidence,end_char}') ~ '^[0-9]+$'
          AND (semantics #>> '{change_evidence,end_char}')::numeric > (semantics #>> '{change_evidence,start_char}')::numeric
        ))
      ) IS TRUE)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_relationships_semantic_history
  ON relationships (book_id, character_a_id, character_b_id,
    (semantics->>'relation_key'), established_page);
