/**
 * S4 표본 검증 — 1개 장(1장)으로 생성 6종 전부를 실제 게이트웨이로 호출해본다.
 * DB 없이 결과를 data/generated/ 에 JSON으로만 남긴다. RDS 준비되면 register류 함수로 적재.
 *
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-generate-sample.ts
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

const BOOK_ID = 'takryu';

interface CharacterOut {
  name: string;
  first_appearance_page: number;
  aliases: { alias: string; type: string; first_appearance_page: number }[];
  notes: { note: string; source_page: number }[];
}

async function main(): Promise<void> {
  const filePath = path.join(__dirname, '../../../data/raw/takryu.txt');
  const rawText = fs.readFileSync(filePath, 'utf-8');
  const { pages: allPages, chapters } = splitBook(rawText, BOOK_ID);

  const chapter = chapters[0];
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
  const summaryRaw = await call('generate_summary', buildSummaryPrompt(chapter, pages));
  const summary = parseJsonResponse<{ summary: string }>(summaryRaw);
  console.log(summary.summary);
  results.chapter_summary = summary;

  // 2) 인물 + 별칭 + 노트
  console.log('\n--- ② 인물 + 별칭 + 노트 ---');
  const characterRaw = await call('generate_character', buildCharacterPrompt(chapter, pages, []));
  const characterOut = parseJsonResponse<{ characters: CharacterOut[] }>(characterRaw);
  console.log(JSON.stringify(characterOut, null, 1));
  const charPages = characterOut.characters.flatMap((c) => [
    c.first_appearance_page,
    ...c.aliases.map((a) => a.first_appearance_page),
    ...c.notes.map((n) => n.source_page),
  ]);
  reportPageBounds('인물/별칭/노트', charPages);
  results.characters = characterOut;

  const knownNames = characterOut.characters.map((c) => c.name);

  // 3) 관계
  console.log('\n--- ③ 관계 ---');
  const relRaw = await call(
    'generate_relationship',
    buildRelationshipPrompt(chapter, pages, knownNames)
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
    relOut.relationships.map((r) => r.established_page)
  );
  results.relationships = relOut;

  // 4) 배경지식 · 소개 (장 무관, 책 전체 1회)
  console.log('\n--- ④ 배경지식 · 소개 ---');
  const bgRaw = await call('generate_background', buildBackgroundPrompt('탁류', '채만식'));
  const bgOut = parseJsonResponse<{ background: string; intro: string }>(bgRaw);
  console.log(JSON.stringify(bgOut, null, 1));
  results.background_and_intro = bgOut;

  // 5) 용어
  console.log('\n--- ⑤ 용어 ---');
  const termRaw = await call('generate_term', buildTermPrompt(chapter, pages));
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
  const eventRaw = await call('generate_event', buildEventPrompt(chapter, pages));
  const eventOut = parseJsonResponse<{
    events: { event: string; description: string; occurrence_page: number }[];
  }>(eventRaw);
  console.log(JSON.stringify(eventOut, null, 1));
  reportPageBounds(
    '사건',
    eventOut.events.map((e) => e.occurrence_page)
  );
  results.events = eventOut;

  const outDir = path.join(__dirname, '../../../data/generated');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'sample-chapter-1.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n=== 저장됨: ${outPath} ===`);
  console.log('사람 검토 필요(V4) — 장 요약이 1장 이후 사건을 담고 있는지 직접 확인할 것.');
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
