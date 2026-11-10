# Grounded relationship candidates

The relationship pipeline extracts a specific predicate and a sentence identifying the subject and object. `semantics.version = 2` retains direction, category, an independent relationship track, ongoing/event scope, active/ended state, assertion status, attribution and exact page/quote/UTF-16 offsets. Canonical endpoint sorting also reverses a directional arrow. Family, employment and feelings between the same people can coexist; an event has its own source anchor.

A valid source quote and a complete schema are **structural checks, not proof that the interpretation is true**. Reversed feelings, misleading quoted speech and literary inference still need semantic review. Accepted candidates remain unpublished until that review. Legacy rows have no inferred direction or invented explanation.

## Local generation for any supplied novel

From `backend/`:

```sh
npx ts-node src/batch/pipeline/run-generate-relationships.ts --input source.json --out data/generated/relationships/new-run
```

The JSON input contains `book_id`, `source` (`kind: actual_novel | synthetic`, description, optional URL/source SHA-256), `known_character_names`, and explicit `chapters`/`pages` using the stored page numbering. An excerpt must say it is an excerpt; synthetic cases are not evidence of performance on another novel. See `evaluation/relationships/model-inputs/` for independently sourced Takryu and Austen excerpts.

The runner uses the existing LLM gateway. It saves the original response, raw candidates, structurally accepted candidates, held candidates with reasons, source input, local resolved identity candidates and a run report. Local identity candidates also require review. It does not connect to a database. Exact cache replay makes no model calls; a changed source, prompt, model, effort or context rejects the old cache and requires a new output directory. Keep old outputs for comparison.

`run-generate-full.ts` requires semantic v2 candidates too. Its v4 cache manifests invalidate older checkpoints. Its `provenance.relationship_coverage` records whether all source chapters were processed; this proves source coverage, **not exhaustive extraction recall**. A changed existing resolved artifact is written as a separate candidate, preserving previous manual corrections.

## Staging a complete replacement

1. Apply the additive relationship-semantics migration in the intended environment.
2. Generate all chapters, inspect held candidates, and review the new full artifact. Existing character IDs must be explicitly reconciled with reviewed identities. Do not regenerate or overwrite existing character/alias corrections to make IDs match.
3. The initial-import command continues to reject existing content by default. For a deliberate complete relationship replacement, use:

   ```sh
   npx ts-node src/batch/pipeline/run-register-content.ts --replace-relationships
   ```

   This existing command targets the full Takryu artifact. The reusable `replaceRelationshipSnapshot` function accepts any book's complete artifact. It verifies the sealed exact stored source, complete chapter coverage and existing endpoint IDs. Partial samples, an empty replacement, duplicate IDs and unmapped endpoints fail before writes. The transaction stages only relationship changes, removes obsolete relationship IDs, invalidates prior relationship approvals, and sets the book unready. It preserves character, alias and note records. A before/after audit is written before commit.
4. Export the review sheet. Inspect direction, specific meaning, assertion/attribution, time/state and quoted evidence. A v2 approval is bound to the exact relationship snapshot. Changed content and old label-only approvals cannot satisfy publication. A v2 semantic correction requires a new reviewed candidate; editing only its label is insufficient.
5. Apply review judgments and separately run the existing publication check. Failed or incomplete review keeps the book unavailable.

Any registration or correction of already public generated content clears readiness before mutation. Replacement and approval application use transactions. The live public database is not changed by local extraction, tests, evaluator fixtures or a local database demonstration.

## Reporting verification

Report code checks, real model generation, public-data mutation, and deployment separately. A passing test does not prove a model ran; a hand-authored source-grounded fixture is not model output; a local database is not the public content store. Failed authentication must be reported as failed generation, even when the environment reports a configured key. Preserve actual source/evidence reports and never substitute synthetic success.
