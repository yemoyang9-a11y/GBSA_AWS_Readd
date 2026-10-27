/**
 * S4 표본 검증 — 1개 장(기본 1장)으로 생성 6종 전부를 실제 게이트웨이로 호출해본다.
 * DB 없이 결과를 data/generated/ 에 JSON으로만 남긴다. RDS 준비되면 register류 함수로 적재.
 *
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-generate-sample.ts
 *        [--book <bookId> --file <원문 경로> --title <제목> --author <저자> --chapter <장 번호>]
 *        결과: takryu는 data/generated/sample-chapter-N.json, 다른 책은 data/generated/<bookId>/
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
import { validateGroundedChapter } from './grounding';
import { bookArgsFromCli, parseChapterNo, requireBookMeta } from './run-args';

// 출력 상한은 reasoning 토큰을 포함한다 — 기본 4096이면 장 하나의 인물·별칭·노트 JSON이 잘린다(화분 1장 incomplete)
const GENERATE_MAX_TOKENS = 16000;

interface CharacterOut {
  name: string;
  first_appearance_page: number;
  aliases: { alias: string; type: string; first_appearance_page: number }[];
  notes: { note: string; source_page: number }[];
}

async function main(): Promise<void> {
  const args = bookArgsFromCli('run-generate-sample');
  const BOOK_ID = args.bookId;
  const { title, author } = requireBookMeta(args);
  const chapterNo = parseChapterNo(process.argv.slice(2));
  const rawText = fs.readFileSync(args.filePath, 'utf-8');
  const { pages: allPages, chapters } = splitBook(rawText, BOOK_ID);

  const chapter = chapters.find((c) => c.chapter_no === chapterNo);
  if (!chapter) {
    throw new Error(`"${BOOK_ID}"에 ${chapterNo}장이 없다 (총 ${chapters.length}장)`);
  }
  const pages = allPages.filter(
    (p) => p.page_no >= chapter.start_page && p.page_no <= chapter.end_page
  );
  console.log(
    `=== 표본: ${chapter.chapter_no}장 "${chapter.title}" (p.${chapter.start_page}~${chapter.end_page}, ${pages.length}페이지) ===\n`
  );

  const results: Record<string, unknown> = {};
  const pageRange = { min: chapter.start_page, max: chapter.end_page };

  function reportPageBounds(label: string, reportedPages: number[]): void {
    const result = checkPageBounds(label, reportedPages, pageRange.min, pageRange.max);
    if (!result.ok) {
      console.warn(
        `  [경고] ${label}: 장 범위(${pageRange.min}~${pageRange.max}) 밖 페이지 태깅 발견 →`,
        result.outOfBounds
      );
    } else {
      console.log(`  [OK] ${label}: 페이지 태깅 전부 장 범위 안 (${reportedPages.length}건)`);
    }
  }

  // 1) 장 요약
  console.log('--- ① 장 요약 ---');
  const summaryRaw = await call('generate_summary', buildSummaryPrompt(chapter, pages), {
    maxTokens: GENERATE_MAX_TOKENS,
  });
  const summary = parseJsonResponse<{ summary: string }>(summaryRaw);
  console.log(summary.summary);
  results.chapter_summary = summary;

  // 2) 인물 + 별칭 + 노트
  console.log('\n--- ② 인물 + 별칭 + 노트 ---');
  const characterRaw = await call('generate_character', buildCharacterPrompt(chapter, pages, []), {
    maxTokens: GENERATE_MAX_TOKENS,
  });
  const characterOut = parseJsonResponse<{ characters: CharacterOut[] }>(characterRaw);
  const validatedCharacters = validateGroundedChapter(characterOut, pages);
  console.log(JSON.stringify(characterOut, null, 1));
  const charPages = validatedCharacters.characters.flatMap((c) => [
    c.first_appearance_page,
    ...c.aliases.map((a) => a.first_appearance_page),
    ...c.notes.map((n) => n.source_page),
  ]);
  reportPageBounds('인물/별칭/노트', charPages);
  results.characters = { characters: validatedCharacters.characters };
  results.character_review = validatedCharacters.review;
  results.raw_character_candidates = characterOut;

  const knownNames = validatedCharacters.characters.map((c) => c.name);

  // 3) 관계
  console.log('\n--- ③ 관계 ---');
  const relRaw = await call(
    'generate_relationship',
    buildRelationshipPrompt(chapter, pages, knownNames),
    { maxTokens: GENERATE_MAX_TOKENS }
  );
  const relOut = parseJsonResponse<{
    relationships: {
      character_a: string;
      character_b: string;
      label: string;
      established_page: number;
    }[];
  }>(relRaw);
  console.log(JSON.stringify(relOut, null, 1));
  reportPageBounds(
    '관계',
    validateGroundedChapter(relOut, pages, {
      requireRelationshipSemantics: true,
    }).relationships.map((r) => r.established_page)
  );
  const validatedRelationships = validateGroundedChapter(relOut, pages, {
    requireRelationshipSemantics: true,
  });
  results.relationships = { relationships: validatedRelationships.relationships };
  results.relationship_review = validatedRelationships.review;
  results.raw_relationship_candidates = relOut;

  // 4) 배경지식 · 소개 (장 무관, 책 전체 1회)
  console.log('\n--- ④ 배경지식 · 소개 ---');
  const bgRaw = await call('generate_background', buildBackgroundPrompt(title, author), {
    maxTokens: GENERATE_MAX_TOKENS,
  });
  const bgOut = parseJsonResponse<{ background: string; intro: string }>(bgRaw);
  console.log(JSON.stringify(bgOut, null, 1));
  results.background_and_intro = bgOut;

  // 5) 용어
  console.log('\n--- ⑤ 용어 ---');
  const termRaw = await call('generate_term', buildTermPrompt(chapter, pages), {
    maxTokens: GENERATE_MAX_TOKENS,
  });
  const termOut = parseJsonResponse<{
    terms: { term: string; definition: string; first_appearance_page: number }[];
  }>(termRaw);
  console.log(JSON.stringify(termOut, null, 1));
  reportPageBounds(
    '용어',
    termOut.terms.map((t) => t.first_appearance_page)
  );
  results.terms = termOut;

  // 6) 사건
  console.log('\n--- ⑥ 사건 ---');
  const eventRaw = await call('generate_event', buildEventPrompt(chapter, pages), {
    maxTokens: GENERATE_MAX_TOKENS,
  });
  const eventOut = parseJsonResponse<{
    events: { event: string; description: string; occurrence_page: number }[];
  }>(eventRaw);
  console.log(JSON.stringify(eventOut, null, 1));
  reportPageBounds(
    '사건',
    eventOut.events.map((e) => e.occurrence_page)
  );
  results.events = eventOut;

  const outDir = args.generatedDir;
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `sample-chapter-${chapter.chapter_no}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n=== 저장됨: ${outPath} ===`);
  console.log(
    `사람 검토 필요(V4) — 장 요약이 ${chapter.chapter_no}장 이후 사건을 담고 있는지 직접 확인할 것.`
  );
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
