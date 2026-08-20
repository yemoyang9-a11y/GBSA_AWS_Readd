/**
 * 리캡 탭 — SSE 스트리밍 렌더 (NFR-PERF-002 🚦)
 *
 * 받은 조각을 순서대로 이어 붙이기만 한다. 스트리밍 중 페이지가 바뀌어도 끊지 않는다 —
 * 진행 중인 응답은 시작 시점 기준점을 유지한다 (UC-27 A5).
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
  if (failed) return <p role="alert">리캡을 불러오지 못했습니다</p>;

  return (
    <div className="p-4">
      <p className="whitespace-pre-wrap">{text}</p>
      {streaming ? <span aria-live="polite">불러오는 중</span> : null}
    </div>
  );
}
