/**
 * 리캡 탭 — SSE 스트리밍 렌더 (NFR-PERF-002 🚦)
 *
 * 받은 조각을 순서대로 이어 붙이기만 한다. 스트리밍 중 페이지가 바뀌어도 끊지 않는다 —
 * 진행 중인 응답은 시작 시점 기준점을 유지한다 (UC-27 A5).
 *
 * 조판은 시안 패널 본문 실측값을 따른다 — Gothic A1 15px, 행간 1.6 (97:1246).
 * 색은 ink로 둔다(critique P2, 2026-08-21) — 이 탭에서 독자가 실제로 찾는 본문이라, muted는
 * 저자명·타임스탬프 같은 진짜 보조 요소에만 남긴다.
 * 바깥 여백은 `SsabiPanel` 의 탭 콘텐츠 영역이 갖고 있으므로 여기서 다시 주지 않는다.
 */
export default function RecapTab({
  text,
  streaming,
  failed,
}: {
  text: string;
  streaming: boolean;
  failed: boolean;
}) {
  if (failed)
    return (
      <p role="alert" className="text-[13px] text-muted">
        리캡을 불러오지 못했습니다
      </p>
    );

  // 백엔드가 문단을 빈 줄로 구분해 보낸다(recap.service.ts) — 그대로 나눠서 별도 문단으로 렌더한다.
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <div className="space-y-3">
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="whitespace-pre-wrap text-[15px] leading-[1.6] text-ink">
          {paragraph}
        </p>
      ))}
      {streaming ? (
        <span aria-live="polite" className="block text-[11px] text-faint">
          불러오는 중
        </span>
      ) : null}
    </div>
  );
}
