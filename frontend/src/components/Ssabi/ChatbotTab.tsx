import { useState } from 'react';

/**
 * 챗봇 탭 — SSE 스트리밍 (NFR-PERF-008)
 *
 * 근거 부재 거절 문구도 일반 delta 로 흘러온다. 프론트는 그것을 보통 답변과 똑같이
 * 렌더하며, 문구를 보고 거절인지 판별하지 않는다 (절대 규칙 7번, FR-QNA-004 🚦).
 * 호출량 상한(429)은 스트림을 열기 전에 걸러져 error 로 전달된다 (R3 8/20 확인).
 *
 * 방금 보낸 질문을 말풍선으로 남긴다 — 시안이 사용자·싸비 말풍선을 나란히 보여준다.
 * **대화 이력은 아직 없다.** 마지막 문답 한 쌍만 보인다 (FR-QNA-003 은 P1).
 *
 * 두 말풍선을 배경색으로 구분한다(critique P2, 2026-08-21) — 정렬(ml-auto/mr-auto)만으로는
 * 좁은 420px 패널에서 여러 줄로 줄바꿈되면 화자 구분이 약하다. 싸비 답변은 이미 활성 탭에
 * 쓰는 ssabi-soft 배경을 그대로 재사용해 "이건 싸비의 목소리"임을 나타내고, 질문 말풍선은
 * canvas(중립)로 남겨 액센트가 사용자 발화 쪽으로 번지지 않게 한다.
 *
 * 답변 말풍선은 `answer`가 있을 때만 그린다(polish, 2026-08-21) — 예전엔 무조건 그려서
 * 질문을 하기도 전에(챗봇 탭을 열자마자) 속이 빈 ssabi-soft 말풍선이 떠 있었다. 실제
 * 백엔드로 확인함.
 *
 * ⚠️ 시안의 "선택 문장 인용"과 "추천 질문 칩"은 만들지 않았다. 인용할 문장을 넘겨받는
 *    경로가 없고, 추천 질문은 CLAUDE.md 9장이 **미결(데모 시연 시나리오)** 로 둔 항목이라
 *    지어내면 잘못된 결정이 코드에 굳는다.
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
      <div className="flex-1 space-y-3 overflow-y-auto">
        {asked ? (
          <p className="ml-auto max-w-[80%] rounded-card bg-canvas px-4 py-2.5 text-xs text-ink">
            {asked}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-xs text-muted">
            {error}
          </p>
        ) : answer ? (
          <p className="mr-auto max-w-[85%] whitespace-pre-wrap rounded-card bg-ssabi-soft px-4 py-2.5 text-xs leading-relaxed text-ink">
            {answer}
          </p>
        ) : null}

        {streaming ? (
          <span aria-live="polite" className="block text-[11px] text-faint">
            답하는 중
          </span>
        ) : null}
      </div>

      <form
        className="mt-4 flex items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2.5"
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
          className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-faint"
          placeholder="읽은 데까지의 내용으로 물어보세요"
        />
        <button
          type="submit"
          disabled={streaming}
          className="shrink-0 text-xs font-bold text-ssabi disabled:opacity-40"
        >
          질문
        </button>
      </form>
    </div>
  );
}
