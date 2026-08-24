import { splitHighlighted } from './highlightNames';

/**
 * 리캡 탭 — SSE 스트리밍 렌더 (NFR-PERF-002 🚦) — 재설계 2026-08-23 (`.reader-scr .e-card`)
 *
 * 받은 조각을 순서대로 이어 붙이기만 한다. 스트리밍 중 페이지가 바뀌어도 끊지 않는다 —
 * 진행 중인 응답은 시작 시점 기준점을 유지한다 (UC-27 A5).
 *
 * 인물 이름 강조(시안의 e-key 스팬)는 2026-08-24 사용자 피드백으로 되살렸다 — 최초
 * 판단("식별 데이터가 없어 지어낸 판정")은 본문 인물명 탭(FR-CHR-004, alias_index 필요)과
 * 혼동한 것이었다. 여기 쓰는 `characterNames`는 같은 화면이 이미 `/ssabi/graph`로 받은
 * 이름 목록이라 기준점 K 이하로 걸러진 값이다(types/ssabi.ts:3) — 지어낸 판정이 아니다.
 * highlightNames.ts 참고.
 *
 * 문단은 원문의 `\n\n`(빈 줄)을 경계로 나눈다 — 스트리밍 도중에는 아직 안 온 빈 줄이 없어
 * 자연스럽게 한 문단으로 보이다가, 다음 문단이 도착하면 나뉜다.
 *
 * 색은 brief-ink로 둔다(critique P2, 2026-08-21 판단 유지) — 이 탭에서 독자가 실제로
 * 찾는 본문이라, brief-muted는 eyebrow 같은 진짜 보조 요소에만 남긴다.
 *
 * 카드에 테두리(brief-rule)를 둔다 — 패널·카드 배경이 둘 다 brief-paper로 통일된 뒤로는
 * (2026-08-24) 배경색만으로 카드 경계가 안 보인다.
 *
 * eyebrow 라벨은 "이전 이야기 요약"을 쓴다 — 백엔드가 본문 첫 줄에 같은 문구를 고정
 * 소제목으로 얹어 보내므로(recap.service.ts), 그 첫 줄을 본문에서 걷어내고 라벨 자리로
 * 옮겨 중복 노출을 없앤다.
 */
export default function RecapTab({
  text,
  streaming,
  failed,
  characterNames = [],
}: {
  text: string;
  streaming: boolean;
  failed: boolean;
  characterNames?: string[];
}) {
  if (failed)
    return (
      <p role="alert" className="text-[13px] text-brief-muted">
        리캡을 불러오지 못했습니다
      </p>
    );

  const RECAP_HEADING = '이전 이야기 요약';

  // 백엔드가 문단을 빈 줄로 구분해 보낸다(recap.service.ts) — 그대로 나눠서 별도 문단으로 렌더한다.
  const rawParagraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  // 백엔드 첫 줄의 고정 소제목은 eyebrow 라벨 자리로 옮겼으니 본문에서는 뺀다.
  const paragraphs =
    rawParagraphs[0]?.trim() === RECAP_HEADING ? rawParagraphs.slice(1) : rawParagraphs;

  return (
    <div className="rounded-xl border border-brief-rule bg-brief-paper p-[26px_22px_22px]">
      <span
        aria-hidden="true"
        className="-mb-3 block font-dashSerif text-[40px] leading-none text-brief-accent opacity-[.28]"
      >
        "
      </span>
      <p className="mb-2.5 font-dashMono text-[10.5px] font-semibold uppercase tracking-[.06em] text-brief-muted">
        이전 이야기 요약
      </p>
      {paragraphs.map((paragraph, i) => (
        <p
          key={i}
          className="whitespace-pre-wrap font-dashSerif text-[15px] leading-[1.85] text-brief-ink [&:not(:first-child)]:mt-3"
        >
          {splitHighlighted(paragraph, characterNames).map((segment, j) =>
            segment.bold ? (
              <b key={j} className="font-bold">
                {segment.text}
              </b>
            ) : (
              segment.text
            )
          )}
        </p>
      ))}
      {streaming ? (
        <span aria-live="polite" className="mt-3 block text-[11px] text-brief-muted">
          불러오는 중
        </span>
      ) : null}
    </div>
  );
}
