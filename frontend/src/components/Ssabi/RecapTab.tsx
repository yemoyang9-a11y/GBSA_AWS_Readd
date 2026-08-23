/**
 * 리캡 탭 — SSE 스트리밍 렌더 (NFR-PERF-002 🚦) — 재설계 2026-08-23 (`.reader-scr .e-card`)
 *
 * 받은 조각을 순서대로 이어 붙이기만 한다. 스트리밍 중 페이지가 바뀌어도 끊지 않는다 —
 * 진행 중인 응답은 시작 시점 기준점을 유지한다 (UC-27 A5).
 *
 * 인물 이름 자동 강조(시안의 e-key 스팬)는 만들지 않는다 — 식별 데이터가 없어 지어낸
 * 판정이 된다.
 *
 * 색은 brief-ink로 둔다(critique P2, 2026-08-21 판단 유지) — 이 탭에서 독자가 실제로
 * 찾는 본문이라, brief-muted는 eyebrow 같은 진짜 보조 요소에만 남긴다.
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
      <p role="alert" className="text-[13px] text-brief-muted">
        리캡을 불러오지 못했습니다
      </p>
    );

  return (
    <div className="rounded-xl bg-brief-paper p-[26px_22px_22px]">
      <span
        aria-hidden="true"
        className="-mb-3 block font-dashSerif text-[40px] leading-none text-brief-accent opacity-[.28]"
      >
        "
      </span>
      <p className="mb-2.5 font-dashMono text-[10.5px] font-semibold uppercase tracking-[.06em] text-brief-muted">
        지금까지
      </p>
      <p className="whitespace-pre-wrap font-dashSerif text-[15px] leading-[1.85] text-brief-ink">
        {text}
      </p>
      {streaming ? (
        <span aria-live="polite" className="mt-3 block text-[11px] text-brief-muted">
          불러오는 중
        </span>
      ) : null}
    </div>
  );
}
