/**
 * 리캡 본문 → 문단 배열 (2026-08-25, RecapTab·BriefingView 공용으로 추출)
 *
 * 백엔드가 문단을 빈 줄(\n\n)로 구분해 보낸다(recap.service.ts buildRecapPrompt).
 * 첫 줄에는 항상 정확히 "이전 이야기 요약"이라는 고정 소제목이 실려 온다(모델이
 * 마크다운 제목을 붙이는 걸 막으려고 문구를 고정했다, recap.service.ts 참조) —
 * 호출부가 자체 라벨/제목을 이미 보여줄 때는 중복이라 여기서 걷어낸다.
 */
const RECAP_HEADING = '이전 이야기 요약';

export function parseRecapParagraphs(text: string): string[] {
  const raw = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return raw[0]?.trim() === RECAP_HEADING ? raw.slice(1) : raw;
}
