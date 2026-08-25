import { splitHighlighted } from './highlightNames';
import { useQuoteSelection } from '../../hooks/useQuoteSelection';
import QuotePopover from '../common/QuotePopover';
import { parseRecapParagraphs } from '../../utils/recapText';

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
 * 카드 테두리는 이 컴포넌트가 아니라 SsabiPanel의 tabpanel 컨테이너가 진다(2026-08-25 —
 * 탭이 카드 위 테두리에 포스트잇처럼 겹치는 디자인으로 바뀌면서, 안쪽에 또 테두리를 두면
 * 이중 박스로 보였다). 여기서는 내용(인용부호·eyebrow·본문)만 그린다.
 *
 * eyebrow 라벨은 "이전 이야기 요약"을 쓴다 — 백엔드가 본문 첫 줄에 같은 문구를 고정
 * 소제목으로 얹어 보내므로(recap.service.ts), 그 첫 줄을 본문에서 걷어내고 라벨 자리로
 * 옮겨 중복 노출을 없앤다.
 *
 * 리캡 문장 드래그 → 챗봇 인용 (2026-08-25, 사용자 요청). ReaderView(본문)와 같은
 * useQuoteSelection 훅을 쓴다 — 리캡도 이미 K 이하로만 만들어진 표시값이라(R2 불변식)
 * 본문과 동급으로 "이미 열람 가능한 확정 텍스트"이므로, 같은 인용 예외 경로를 하나 더
 * 연결하는 것뿐이다. 새 cutoff 판정은 없다.
 */
export default function RecapTab({
  text,
  streaming,
  failed,
  characterNames = [],
  onQuote,
}: {
  text: string;
  streaming: boolean;
  failed: boolean;
  characterNames?: string[];
  onQuote?: (text: string) => void;
}) {
  const { containerRef, popover, clearPopover } = useQuoteSelection<HTMLDivElement>();

  if (failed)
    return (
      <p role="alert" className="text-[13px] text-brief-muted">
        리캡을 불러오지 못했습니다
      </p>
    );

  // 백엔드 첫 줄의 고정 소제목("이전 이야기 요약")은 eyebrow 라벨 자리로 옮겼으니
  // 본문에서는 뺀다 — 파싱 로직은 BriefingView와 공유한다(utils/recapText.ts).
  const paragraphs = parseRecapParagraphs(text);

  return (
    <div ref={containerRef}>
      <QuotePopover popover={popover} onQuote={onQuote} onDone={clearPopover} />
      {/* 장식용 인용부호 (2026-08-25, 사용자 요청) — 손으로 그린 아이콘 대신 폰트 자체의
          정식 타이포그래피 곱따옴표 글리프(U+201C/U+201D)를 큼직하게 쓴다. 아이콘은
          모양이 어색했다(사용자 피드백 "좀 못생겼어") — 세리프 폰트가 원래 잘 그려 둔
          곱따옴표를 그대로 쓰는 쪽이 더 낫다. 여는 부호는 카드 맨 위에, 닫는 부호는
          본문이 다 온 뒤(스트리밍 중엔 아직 안 끝난 문장에 마침표 찍는 셈이라 숨김)
          끝에 오른쪽 정렬로 놓는다. 본문과의 간격도 넓혔다(사용자 요청). */}
      <span
        aria-hidden="true"
        className="mb-4 block font-dashSerif text-[52px] font-bold leading-none text-brief-accent opacity-[.45]"
      >
        “
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
      ) : (
        <span
          aria-hidden="true"
          className="mt-4 block text-right font-dashSerif text-[52px] font-bold leading-none text-brief-accent opacity-[.45]"
        >
          ”
        </span>
      )}
    </div>
  );
}
