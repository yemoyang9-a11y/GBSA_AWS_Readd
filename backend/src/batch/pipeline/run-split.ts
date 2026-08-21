/**
 * S1~S3 실행 스크립트 — 원문 등록 + 페이지 분할 + 자가 검증 + CP1 실측 보고
 * 사용법: npx ts-node src/batch/pipeline/run-split.ts <원문 경로> <bookId>
 */
import * as fs from 'fs';
import * as path from 'path';
import { splitBook, validateSplit, computeMeasurements } from './split';

function main(): void {
  const filePath = process.argv[2] ?? path.join(__dirname, '../../../data/raw/takryu.txt');
  const bookId = process.argv[3] ?? 'takryu';

  const rawText = fs.readFileSync(filePath, 'utf-8');
  const { pages, chapters } = splitBook(rawText, bookId);
  const report = validateSplit(pages, chapters, rawText);
  const measurements = computeMeasurements(pages, chapters, rawText);

  console.log('=== V1/V2 자가 검증 ===');
  console.log('FR-DAT-002 커버리지 위반:', report.coverageViolations);
  console.log('D11 장 가로지름/장경계 위반:', report.crossChapterViolations);
  console.log('D11 문장 중간 절단 위반:', report.midSentenceViolations);
  console.log('D11 700자 미만(장 마지막 제외):', report.underMinViolations);
  console.log('D11 1,400자 초과:', report.oversizedPages);
  if (report.details.length > 0) {
    console.log('--- 상세 ---');
    report.details.forEach((d) => console.log(' -', d));
  }

  console.log('\n=== S3 실측 3건 (CP1 보고용) ===');
  console.log('① 총 페이지 수:', measurements.totalPages);
  console.log('   700자 미만 비율(장 마지막 제외):', (measurements.underMinRatio * 100).toFixed(2) + '%');
  console.log('   1,400자 초과 비율:', (measurements.overMaxRatio * 100).toFixed(2) + '%');
  console.log('② 문장 경계 폴백 횟수(문단 경계를 못 쓴 페이지 수):', measurements.sentenceFallbackCount);
  console.log('③ 가장 긴 장의 원문 절단 최대 크기(R3 성능예산 입력):', measurements.longestChapterRawLength, '자');
  console.log('\n장 수:', chapters.length);

  const hasViolation =
    report.coverageViolations > 0 || report.crossChapterViolations > 0 || report.midSentenceViolations > 0;
  if (hasViolation) {
    console.error('\n[FAIL] 게이트 위반 발견 — 다음 단계로 진행하지 않는다 (CLAUDE.md 7장)');
    process.exit(1);
  }
  console.log('\n[OK] 게이트 위반 0건. 700/1,400자 상한 위반은 CP1 판정 대상으로 별도 보고한다.');
}

main();
