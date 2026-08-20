import { useState } from 'react';

/**
 * 챗봇 탭 — SSE 스트리밍 (NFR-PERF-008)
 *
 * 근거 부재 거절 문구도 일반 delta 로 흘러온다. 프론트는 그것을 보통 답변과 똑같이
 * 렌더하며, 문구를 보고 거절인지 판별하지 않는다 (절대 규칙 7번, FR-QNA-004 🚦).
 * 호출량 상한(429)은 스트림을 열기 전에 걸러져 error 로 전달된다 (R3 8/20 확인).
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

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex-1 overflow-y-auto">
        {error ? <p role="alert">{error}</p> : <p className="whitespace-pre-wrap">{answer}</p>}
        {streaming ? <span aria-live="polite">답하는 중</span> : null}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!query.trim() || streaming) return;
          onAsk(query.trim());
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
          className="flex-1 border p-2"
          placeholder="읽은 데까지의 내용으로 물어보세요"
        />
        <button type="submit" disabled={streaming}>
          질문
        </button>
      </form>
    </div>
  );
}
