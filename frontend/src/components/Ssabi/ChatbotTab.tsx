import { useState } from 'react';

/**
 * 챗봇 탭 — SSE 스트리밍 (NFR-PERF-008) — 재설계 2026-08-23 (`.reader-scr .a-thread`)
 *
 * 근거 부재 거절 문구도 일반 delta 로 흘러온다. 프론트는 그것을 보통 답변과 똑같이
 * 렌더하며, 문구를 보고 거절인지 판별하지 않는다 (절대 규칙 7번, FR-QNA-004 🚦).
 *
 * **대화 이력은 아직 없다.** 마지막 문답 한 쌍만 보인다 (FR-QNA-003 은 P1).
 *
 * 시안은 사용자 말풍선(paper 배경 + rule 테두리)과 싸비 답변(원형 아바타 + panel 배경 +
 * accent 테두리)을 다른 처리로 구분한다 — 정렬만으로는 좁은 패널에서 화자 구분이 약하다는
 * critique P2(2026-08-21) 판단을 그대로 잇는다.
 *
 * 아바타는 텍스트 "싸" 대신 마스코트 이미지(`/assets/ssabi-face.png`, 사용자 제공 원본을
 * public/assets로 복사)를 쓴다(2026-08-24).
 *
 * 답변 말풍선은 `answer`가 있을 때만 그린다 — 질문 전에 빈 말풍선이 뜨지 않게 한다.
 *
 * ⚠️ 시안의 "선택 문장 인용"과 "추천 질문 칩"은 만들지 않는다 — 인용할 문장을 넘겨받는
 *    경로가 없고, 추천 질문은 CLAUDE.md 9장이 미결로 둔 항목이다.
 */
export default function ChatbotTab({
  answer,
  streaming,
  error,
  onAsk,
}: {
  answer: string;
  streaming: boolean;
  error: string | null;
  onAsk: (query: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');

  return (
    <div className="flex h-full flex-col">
      <div className="brief-scroll flex-1 space-y-3 overflow-y-auto">
        {asked ? (
          <p className="ml-auto max-w-[76%] rounded-2xl rounded-br-md border border-brief-rule bg-brief-paper px-[13px] py-[9px] text-xs leading-[1.6] text-brief-ink">
            {asked}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-xs text-brief-muted">
            {error}
          </p>
        ) : answer ? (
          <div className="flex items-end gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brief-accent bg-brief-accent-soft"
            >
              <img src="/assets/ssabi-face.png" alt="" className="size-full object-contain" />
            </span>
            <p className="max-w-[76%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-brief-accent bg-white px-[13px] py-[9px] text-xs leading-[1.6] text-brief-ink">
              {answer}
            </p>
          </div>
        ) : null}

        {streaming ? (
          <span aria-live="polite" className="block text-[11px] text-brief-muted">
            답하는 중
          </span>
        ) : null}
      </div>

      <form
        className="mt-4 flex items-center gap-2 rounded-full border border-brief-rule bg-white px-4 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!query.trim() || streaming) return;
          onAsk(query.trim());
          setAsked(query.trim());
          setQuery('');
        }}
      >
        <label htmlFor="chat-query" className="sr-only">
          질문
        </label>
        <input
          id="chat-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="flex-1 bg-transparent text-xs text-brief-ink outline-none placeholder:text-brief-muted"
          placeholder="읽은 데까지의 내용으로 물어보세요"
        />
        <button
          type="submit"
          disabled={streaming}
          className="shrink-0 font-dashSans text-xs font-bold text-brief-accent disabled:opacity-40"
        >
          질문
        </button>
      </form>
    </div>
  );
}
