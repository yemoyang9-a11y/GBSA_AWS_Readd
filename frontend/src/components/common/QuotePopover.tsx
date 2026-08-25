import { createPortal } from 'react-dom';
import type { QuoteSelectionPopover } from '../../hooks/useQuoteSelection';

/** 버튼 자체 높이 + 여백 추정치 — 위쪽에 이만큼도 공간이 없으면 아래로 뒤집는다. */
const POPOVER_HEIGHT = 40;
const GAP = 10;

/**
 * 드래그 선택 종료 시 뜨는 "아모에게 물어보기" 버튼 — useQuoteSelection과 짝을 이룬다.
 * ReaderView(본문)·RecapTab(리캡)이 공유한다(2026-08-25).
 *
 * 위치는 선택 영역의 오른쪽, 말풍선 모양(둥근 모서리 하나가 각져 방향을 암시)으로 뜬다 —
 * 가운데 정렬로 선택한 줄 위에 얹으면 그 줄이나 바로 윗줄 글자를 가렸다(2026-08-25,
 * 사용자 피드백). 오른쪽으로 옮기면 대개 본문 오른쪽 여백 위에 떠서 글자를 가리지 않는다.
 *
 * `right`로 앵커한다(`left`가 아니라) — 리캡 카드처럼 좁은 패널에서는 선택 영역의
 * 오른쪽 끝이 컨테이너 오른쪽 여백에 가깝게 걸리는 일이 흔한데, `left: rect.right`로
 * 왼쪽부터 그리면 그 자리에서 오른쪽으로 더 자라나 화면 밖으로 잘려 나갔다(2026-08-25,
 * 실측 — 리캡 첫 줄 인용 시 재현). `right`로 앵커해 왼쪽으로 자라게 하면 항상 뷰포트
 * 안에 머문다.
 *
 * 위쪽 공간이 부족하면(예: 리캡 카드 맨 위쪽 문장 — 바로 위가 탭 바) 선택 영역 **아래**로
 * 뒤집는다 — 안 그러면 팝오버가 탭 바 등 다른 UI와 겹쳐 클릭이 씹혔다(2026-08-25, 실측).
 *
 * document.body로 포털한다(2026-08-25, 실측) — `fixed`라도 z-index는 컴포넌트가 실제로
 * 그려지는 DOM 위치의 조상 스태킹 컨텍스트 안에서만 비교된다. SsabiPanel의 tabpanel이
 * `relative z-0`로 자기 스태킹 컨텍스트를 만들고, 그 형제인 탭 바(`relative z-10`)가 그
 * 컨텍스트 전체보다 위에 오므로, tabpanel 안에 있는 이 버튼은 z-20이어도 탭 바에
 * 가려 클릭이 안 먹었다(elementFromPoint로 직접 확인). body로 포털하면 그런 조상
 * 스태킹 컨텍스트 자체를 벗어나므로 z-index 비교가 항상 의도대로 동작한다.
 *
 * animate-pop-in(2026-08-25, 사용자 요청 — "거칠게 뜬다")으로 등장 시 살짝 커지며
 * 페이드인한다. transform이 아니라 별개 프로퍼티인 scale로 애니메이션한다 — 이 버튼은
 * 위치 자체를 -translate-y-full(transform)로 잡고 있어서, 등장 애니메이션도 transform을
 * 쓰면 그 위치용 값을 덮어써 버린다.
 */
export default function QuotePopover({
  popover,
  onQuote,
  onDone,
}: {
  popover: QuoteSelectionPopover | null;
  onQuote?: (text: string) => void;
  onDone: () => void;
}) {
  if (!popover || !onQuote) return null;

  const showBelow = popover.top < POPOVER_HEIGHT + GAP;
  const right = Math.max(8, window.innerWidth - popover.right);

  return createPortal(
    <button
      type="button"
      style={showBelow ? { top: popover.bottom + GAP, right } : { top: popover.top - GAP, right }}
      className={`fixed z-20 animate-pop-in whitespace-nowrap rounded-2xl border border-brief-accent bg-brief-accent-soft px-3.5 py-2 text-[11px] font-bold text-brief-accent shadow-brief-soft-sm ${
        showBelow ? 'rounded-tr-md' : '-translate-y-full rounded-br-md'
      }`}
      onMouseDown={(event) => {
        // mousedown 이 먼저 발생해 포커스가 옮겨가면 클릭 전에 선택이 풀린다 — 막는다.
        // (document mousedown 리스너가 팝오버를 지우는 것도 이 버튼 자체는 피해야 하므로
        // stopPropagation으로 버블링을 끊는다.)
        event.preventDefault();
        event.stopPropagation();
      }}
      onTouchStart={(event) => {
        // 태블릿에서 버튼을 탭할 때도 document touchstart 리스너가 먼저 팝오버를
        // 지워버리지 않게 막는다 (NFR-USE 태블릿 우선).
        event.stopPropagation();
      }}
      onClick={() => {
        onQuote(popover.text);
        document.getSelection()?.removeAllRanges();
        onDone();
      }}
    >
      아모에게 물어보기
    </button>,
    document.body
  );
}
