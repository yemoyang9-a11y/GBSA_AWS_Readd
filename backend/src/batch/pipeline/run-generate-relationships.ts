/**
 * FR-DAT-005 / R12: novel-independent local candidate generation through gateway ⑥.
 * Usage: npx ts-node src/batch/pipeline/run-generate-relationships.ts --input source.json --out output-dir
 * Input contains explicit pages/chapters plus source provenance; no DB connection or publication.
 */
import * as fs from 'fs';
import * as path from 'path';
import { isDeepStrictEqual } from 'util';
import { v5 as uuidv5 } from 'uuid';
import { createEmptyState, mergeRelationships } from './accumulate';
import { Chapter, Page } from '../../shared/types';
import { call } from '../../modules/llm-gateway/gateway';
import { LLM_PROVIDER, MODEL_CONFIG, DEFAULT_EFFORT } from '../../modules/llm-gateway/model-config';
import { buildRelationshipPrompt, parseJsonResponse } from './generate';
import {
  assertGroundingCache,
  sealChapterCache,
  validateGroundedChapter,
  GroundedRelationship,
} from './grounding';

export interface RelationshipGenerationInput {
  book_id: string;
  source: {
    kind: 'actual_novel' | 'synthetic';
    description: string;
    url?: string;
    sha256?: string;
  };
  known_character_names: string[];
  chapters: Chapter[];
  pages: Page[];
}

function assertInput(input: RelationshipGenerationInput): void {
  if (
    !input.book_id ||
    !['actual_novel', 'synthetic'].includes(input.source?.kind) ||
    !input.source?.description ||
    !Array.isArray(input.known_character_names) ||
    !input.known_character_names.every((n) => typeof n === 'string' && n.trim()) ||
    !Array.isArray(input.chapters) ||
    !input.chapters.length ||
    !Array.isArray(input.pages) ||
    !input.pages.length
  )
    throw new Error('Explicit book, source provenance, known names, chapters and pages required');
  const pages = new Set<number>();
  for (const page of input.pages) {
    if (
      page.book_id !== input.book_id ||
      !Number.isInteger(page.page_no) ||
      page.page_no < 1 ||
      !page.content ||
      pages.has(page.page_no)
    )
      throw new Error('Pages must be unique positive numbered source text from the selected book');
    pages.add(page.page_no);
  }
  for (const chapter of input.chapters) {
    if (
      chapter.book_id !== input.book_id ||
      !Number.isInteger(chapter.chapter_no) ||
      chapter.start_page > chapter.end_page ||
      !pages.has(chapter.start_page) ||
      !pages.has(chapter.end_page)
    )
      throw new Error('Each source window must have explicit matching chapter boundaries');
  }
}

export async function runRelationshipGeneration(
  input: RelationshipGenerationInput,
  outputDirectory: string
) {
  assertInput(input);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const sourceFile = path.join(outputDirectory, 'source-input.json');
  if (fs.existsSync(sourceFile)) {
    if (!isDeepStrictEqual(JSON.parse(fs.readFileSync(sourceFile, 'utf8')), input))
      throw new Error(
        'Stale source input; use a new output directory and preserve previous artifacts'
      );
  } else fs.writeFileSync(sourceFile, JSON.stringify(input, null, 2), { flag: 'wx' });
  const state = createEmptyState(input.book_id);
  const counts = { raw: 0, accepted: 0, held: 0 };
  const previous: GroundedRelationship[] = [];
  const contract = JSON.stringify({
    prompt: buildRelationshipPrompt.toString(),
    provider: LLM_PROVIDER,
    model: MODEL_CONFIG.generate_relationship,
    effort: DEFAULT_EFFORT,
    source: input.source,
  });
  const execution: {
    chapter_no: number;
    mode: 'generated' | 'replayed';
    raw: number;
    accepted: number;
    held: number;
  }[] = [];
  for (const chapter of [...input.chapters].sort((a, b) => a.start_page - b.start_page)) {
    const pages = input.pages.filter(
      (p) => p.page_no >= chapter.start_page && p.page_no <= chapter.end_page
    );
    const context = previous.map((r) =>
      JSON.stringify({
        character_a: r.character_a,
        character_b: r.character_b,
        label: r.label,
        established_page: r.established_page,
        semantics: r.semantics,
      })
    );
    const known = [...input.known_character_names, JSON.stringify(context)];
    const file = path.join(outputDirectory, `chapter-${chapter.chapter_no}.json`);
    let raw: { relationships?: unknown[] };
    let mode: 'generated' | 'replayed';
    if (fs.existsSync(file)) {
      const cache = JSON.parse(fs.readFileSync(file, 'utf8'));
      assertGroundingCache(cache, chapter, pages, known, contract);
      raw = cache.raw;
      mode = 'replayed';
    } else {
      // All external generation goes through the existing gateway; no model/provider fallback.
      const response = await call(
        'generate_relationship',
        buildRelationshipPrompt(chapter, pages, input.known_character_names, context)
      );
      // Keep the original response even if parsing fails, so diagnostics are not silently discarded.
      fs.writeFileSync(
        path.join(outputDirectory, `chapter-${chapter.chapter_no}.response.txt`),
        response,
        { flag: 'wx' }
      );
      raw = parseJsonResponse(response);
      mode = 'generated';
    }
    const validated = validateGroundedChapter(raw, pages, { requireRelationshipSemantics: true });
    const chapterCounts = {
      raw: Array.isArray(raw.relationships) ? raw.relationships.length : 0,
      accepted: validated.relationships.length,
      held: validated.review.length,
    };
    for (const key of ['raw', 'accepted', 'held'] as const) counts[key] += chapterCounts[key];
    if (mode === 'generated')
      fs.writeFileSync(
        file,
        JSON.stringify(
          sealChapterCache(
            {
              book_id: input.book_id,
              source: input.source,
              raw,
              accepted: validated.relationships,
              held: validated.review,
              semantic_review: 'required',
            },
            chapter,
            pages,
            known,
            contract
          ),
          null,
          2
        ),
        { flag: 'wx' }
      );
    // Local display identities are candidates too; this runner does not certify personhood.
    for (const relation of validated.relationships) {
      for (const name of [relation.character_a, relation.character_b]) {
        if (!state.characters.some((c) => c.name === name)) {
          const first = input.pages
            .filter((p) => p.page_no <= relation.established_page && p.content.includes(name))
            .sort((a, b) => a.page_no - b.page_no)[0];
          if (first)
            state.characters.push({
              id: uuidv5(JSON.stringify([input.book_id, name]), uuidv5.URL),
              name,
              first_appearance_page: first.page_no,
              aliases: [],
              notes: [],
            });
        }
      }
      const a = state.characters.find((c) => c.name === relation.character_a);
      const b = state.characters.find((c) => c.name === relation.character_b);
      if (a && b)
        mergeRelationships(state, [{ ...relation, character_a_id: a.id, character_b_id: b.id }]);
    }
    state.review.push(...validated.review);
    previous.push(...validated.relationships);
    execution.push({ chapter_no: chapter.chapter_no, mode, ...chapterCounts });
  }
  const report = {
    book_id: input.book_id,
    source: input.source,
    generated_at: new Date().toISOString(),
    provider: LLM_PROVIDER,
    model: MODEL_CONFIG.generate_relationship,
    effort: DEFAULT_EFFORT,
    counts,
    execution,
    automated_validation: 'exact evidence and structural/conservative semantic guards only',
    semantic_review: 'required',
    public_store_updated: false,
    deployed: false,
  };
  fs.writeFileSync(
    path.join(outputDirectory, 'resolved-candidates.json'),
    JSON.stringify(
      {
        ...state,
        source: input.source,
        pages: input.pages,
        chapters: input.chapters,
        identity_review: 'required',
        semantic_review: 'required',
        public_store_updated: false,
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(outputDirectory, 'run-report.json'), JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const inputFile = args[args.indexOf('--input') + 1];
  const output = args[args.indexOf('--out') + 1];
  if (!args.includes('--input') || !args.includes('--out') || !inputFile || !output) {
    console.error('Usage: --input source.json --out new-output-directory');
    process.exitCode = 1;
  } else
    runRelationshipGeneration(JSON.parse(fs.readFileSync(inputFile, 'utf8')), output)
      .then((report) => console.log(JSON.stringify(report, null, 2)))
      .catch((error: unknown) => {
        const message =
          error instanceof Error &&
          /^OPENAI_[A-Z_]+(?: status=[0-9]+)?(?: code=[a-z0-9_-]+)?$/i.test(error.message)
            ? error.message
            : 'LOCAL_ARTIFACT_OR_GENERATION_ERROR';
        console.error(
          `Relationship generation failed: ${message}; preserved local artifacts require inspection.`
        );
        process.exitCode = 1;
      });
}
