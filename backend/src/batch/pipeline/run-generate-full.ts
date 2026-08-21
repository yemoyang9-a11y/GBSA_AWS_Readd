/**
 * S4 본실행 — 19장 × 생성 6종 전체를 게이트웨이로 호출한다.
 *
 * 장별로 결과를 data/generated/full/chapter-{N}.json에 즉시 저장한다 — 이미 저장된
 * 장은 재호출하지 않고 파일을 그대로 재생(replay)해 상태를 복원한다(재시작 시 이어서
 * 진행, LLM 재호출 비용 없음). 배경지식·소개는 책 전체 1회이므로 background.json 하나.
 *
 * DB 연결 없음 — RDS 준비 전까지는 JSON으로만 남기고, 준비되면 register류 함수로 적재.
 * 최종적으로 data/generated/full/all-resolved.json에 인물 id가 해소된 전체 결과를 합친다.
 *
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-generate-full.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { call } from '../../modules/llm-gateway/gateway';
import { splitBook } from './split';
import {
  buildSummaryPrompt,
  buildCharacterPrompt,
  buildRelationshipPrompt,
  buildBackgroundPrompt,
  buildTermPrompt,
  buildEventPrompt,
  parseJsonResponse,
} from './generate';
import { checkPageBounds } from './validate';
import {
  createEmptyState,
  knownCharacterNames,
  mergeCharacters,
  mergeRelationships,
  mergeTerms,
  resolveCharacterId,
  GenerationState,
} from './accumulate';
import { Chapter, Page } from '../../shared/types';

const BOOK_ID = 'takryu';
const OUT_DIR = path.join(__dirname, '../../../data/generated/full');

interface RawCharacter {
  name: string;
  first_appearance_page: number;
  aliases: { alias: string; type: string; first_appearance_page: number }[];
  notes: { note: string; source_page: number }[];
}
interface RawRelationship {
  character_a: string;
  character_b: string;
  label: string;
  established_page: number;
}
interface RawTerm {
  term: string;
  definition: string;
  first_appearance_page: number;
}
interface RawEvent {
  event: string;
  description: string;
  occurrence_page: number;
}

interface ChapterOutput {
  chapter_no: number;
  title: string;
  start_page: number;
  end_page: number;
  summary: string;
  characters: RawCharacter[];
  relationships: RawRelationship[];
  terms: RawTerm[];
  events: RawEvent[];
  warnings: string[];
}

function chapterFilePath(chapterNo: number): string {
  return path.join(OUT_DIR, `chapter-${chapterNo}.json`);
}

/** 이 장을 실제 게이트웨이로 생성한다 — 캐시가 있으면 절대 여기까지 오지 않는다 */
async function generateChapter(chapter: Chapter, pages: Page[], known: string[]): Promise<ChapterOutput> {
  const warnings: string[] = [];
  const bounds = { min: chapter.start_page, max: chapter.end_page };

  function record(label: string, reportedPages: unknown[]): void {
    const missing = reportedPages.filter((p) => typeof p !== 'number' || !Number.isFinite(p));
    if (missing.length > 0) {
      warnings.push(`${label}: 페이지 번호 누락/비정수 ${missing.length}건 (LLM이 값을 채우지 않음)`);
    }

    const numericPages = reportedPages.filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
    const result = checkPageBounds(label, numericPages, bounds.min, bounds.max);
    if (!result.ok) {
      warnings.push(`${label}: 장 범위(${bounds.min}~${bounds.max}) 밖 페이지 → ${result.outOfBounds.join(', ')}`);
    }
  }

  const summaryRaw = await call('generate_summary', buildSummaryPrompt(chapter, pages));
  const { summary } = parseJsonResponse<{ summary: string }>(summaryRaw);

  const characterRaw = await call('generate_character', buildCharacterPrompt(chapter, pages, known));
  const { characters } = parseJsonResponse<{ characters: RawCharacter[] }>(characterRaw);
  record(
    '인물/별칭/노트',
    characters.flatMap((c) => [
      c.first_appearance_page,
      ...c.aliases.map((a) => a.first_appearance_page),
      ...c.notes.map((n) => n.source_page),
    ])
  );

  const knownForRelationships = [...known, ...characters.map((c) => c.name)];
  const relRaw = await call('generate_relationship', buildRelationshipPrompt(chapter, pages, knownForRelationships));
  const { relationships } = parseJsonResponse<{ relationships: RawRelationship[] }>(relRaw);
  record('관계', relationships.map((r) => r.established_page));

  const termRaw = await call('generate_term', buildTermPrompt(chapter, pages));
  const { terms } = parseJsonResponse<{ terms: RawTerm[] }>(termRaw);
  record('용어', terms.map((t) => t.first_appearance_page));

  const eventRaw = await call('generate_event', buildEventPrompt(chapter, pages));
  const { events } = parseJsonResponse<{ events: RawEvent[] }>(eventRaw);
  record('사건', events.map((e) => e.occurrence_page));

  return {
    chapter_no: chapter.chapter_no,
    title: chapter.title,
    start_page: chapter.start_page,
    end_page: chapter.end_page,
    summary,
    characters,
    relationships,
    terms,
    events,
    warnings,
  };
}

/** 캐시된 장 결과가 있으면 재생하고, 없으면 새로 생성해 즉시 저장한다 */
async function loadOrGenerateChapter(chapter: Chapter, pages: Page[], known: string[]): Promise<ChapterOutput> {
  const filePath = chapterFilePath(chapter.chapter_no);
  if (fs.existsSync(filePath)) {
    console.log(`[재생] ${chapter.chapter_no}장 "${chapter.title}" — 기존 결과 재사용`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ChapterOutput;
  }

  console.log(`[생성] ${chapter.chapter_no}장 "${chapter.title}" (p.${chapter.start_page}~${chapter.end_page}) 게이트웨이 호출 중...`);
  const output = await generateChapter(chapter, pages, known);
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
  if (output.warnings.length > 0) {
    console.warn(`  [경고] ${chapter.chapter_no}장:`, output.warnings);
  }
  console.log(`  [저장] ${filePath}`);
  return output;
}

async function loadOrGenerateBackground(): Promise<{ background: string; intro: string }> {
  const filePath = path.join(OUT_DIR, 'background.json');
  if (fs.existsSync(filePath)) {
    console.log('[재생] 배경지식·소개 — 기존 결과 재사용');
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  console.log('[생성] 배경지식·소개 게이트웨이 호출 중...');
  const raw = await call('generate_background', buildBackgroundPrompt('탁류', '채만식'));
  const out = parseJsonResponse<{ background: string; intro: string }>(raw);
  fs.writeFileSync(filePath, JSON.stringify(out, null, 2), 'utf-8');
  return out;
}

/** 해당 장의 관계 결과를 이름→id로 해소해 상태에 병합한다. 매칭 실패는 건너뛰고 경고만 남긴다(지어내지 않는다) */
function mergeChapterRelationships(state: GenerationState, chapterNo: number, relationships: RawRelationship[]): void {
  const resolved: { character_a_id: string; character_b_id: string; label: string; established_page: number }[] = [];
  for (const r of relationships) {
    const aId = resolveCharacterId(state, r.character_a);
    const bId = resolveCharacterId(state, r.character_b);
    if (!aId || !bId) {
      console.warn(
        `  [경고] ${chapterNo}장: 관계의 인물명을 인물 목록에서 찾지 못함 — "${r.character_a}" / "${r.character_b}" (검수 대상)`
      );
      continue;
    }
    resolved.push({ character_a_id: aId, character_b_id: bId, label: r.label, established_page: r.established_page });
  }
  mergeRelationships(state, resolved);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const filePath = path.join(__dirname, '../../../data/raw/takryu.txt');
  const rawText = fs.readFileSync(filePath, 'utf-8');
  const { pages: allPages, chapters: allChapters } = splitBook(rawText, BOOK_ID);

  // MAX_CHAPTERS — 전체 배치 전 소규모 스모크 테스트용. 지정 안 하면 전체 장 처리
  const maxChapters = process.env.MAX_CHAPTERS ? parseInt(process.env.MAX_CHAPTERS, 10) : allChapters.length;
  const chapters = allChapters.slice(0, maxChapters);
  console.log(`=== 「탁류」 총 ${allChapters.length}장 중 ${chapters.length}장 처리, ${allPages.length}페이지 — 본실행 시작 ===\n`);

  const state = createEmptyState();
  const chapterSummaries: { chapter_no: number; title: string; summary: string }[] = [];
  const allEvents: { id: string; event: string; description: string; occurrence_page: number }[] = [];

  for (const chapter of chapters) {
    const pages = allPages.filter((p) => p.page_no >= chapter.start_page && p.page_no <= chapter.end_page);
    const known = knownCharacterNames(state);

    const output = await loadOrGenerateChapter(chapter, pages, known);

    mergeCharacters(state, output.characters);
    mergeChapterRelationships(state, chapter.chapter_no, output.relationships);
    mergeTerms(state, output.terms);

    chapterSummaries.push({ chapter_no: output.chapter_no, title: output.title, summary: output.summary });
    for (const e of output.events) {
      allEvents.push({ id: `${chapter.chapter_no}-${allEvents.length}`, ...e });
    }

    console.log(`  누적 인물 ${state.characters.length}명, 관계(이력 포함) ${state.relationships.length}건, 용어 ${state.terms.length}개\n`);
  }

  const background = await loadOrGenerateBackground();

  const combined = {
    book_id: BOOK_ID,
    chapter_summaries: chapterSummaries,
    characters: state.characters,
    relationships: state.relationships,
    terms: state.terms,
    events: allEvents,
    background_and_intro: background,
  };
  const combinedPath = path.join(OUT_DIR, 'all-resolved.json');
  fs.writeFileSync(combinedPath, JSON.stringify(combined, null, 2), 'utf-8');

  console.log(`=== 완료 — ${combinedPath} ===`);
  console.log(`인물 ${state.characters.length}명 · 관계(이력 포함) ${state.relationships.length}건 · 용어 ${state.terms.length}개 · 사건 ${allEvents.length}건`);
  console.log('사람 검토 필요(V4/S7) — 장 요약의 미래 사건 언급, 관계 이력 라벨, 별칭 통합을 직접 확인할 것.');
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
