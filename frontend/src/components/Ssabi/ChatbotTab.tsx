import { useEffect, useRef, useState } from 'react';
import type { ChatbotConversationSummary, ChatbotConversationTurn } from '../../types';

/**
 * 챗봇 탭 — SSE 스트리밍 (NFR-PERF-008)
 *
 * 근거 부재 거절 문구도 일반 delta 로 흘러온다. 프론트는 그것을 보통 답변과 똑같이
 * 렌더하며, 문구를 보고 거절인지 판별하지 않는다 (절대 규칙 7번, FR-QNA-004 🚦).
 * 호출량 상한(429)은 스트림을 열기 전에 걸러져 error 로 전달된다 (R3 8/20 확인).
 *
 * 대화 이력 (2026-08-24, 사용자·R2 조율 결정) — 클로드류 "새 채팅" + 하루(KST) 단위
 * 자동 롤오버. `turns`가 오면 그 대화의 전체 문답을 그리고, 없으면 이전 동작(마지막
 * 문답 한 쌍만 로컬 상태로 표시)으로 남는다 — 부모가 아직 대화 이력을 연결하지 않은
 * 화면(테스트 등)에서도 그대로 동작하도록 하위 호환을 유지한다.
 *
 * 두 말풍선을 배경색으로 구분한다(critique P2, 2026-08-21) — 정렬(ml-auto/mr-auto)만으로는
 * 좁은 420px 패널에서 여러 줄로 줄바꿈되면 화자 구분이 약하다. 싸비 답변은 이미 활성 탭에
 * 쓰는 ssabi-soft 배경을 그대로 재사용해 "이건 싸비의 목소리"임을 나타내고, 질문 말풍선은
 * canvas(중립)로 남겨 액센트가 사용자 발화 쪽으로 번지지 않게 한다.
 *
 * 답변 말풍선은 `answer`가 있을 때만 그린다(polish, 2026-08-21) — 예전엔 무조건 그려서
 * 질문을 하기도 전에(챗봇 탭을 열자마자) 속이 빈 ssabi-soft 말풍선이 떠 있었다.
 *
 * 선택 문장 인용 (2026-08-24) — 본문 드래그로 고른 문장이 `quote` prop 으로 오면 입력창에
 * 그대로 채운다. 인용문은 챗봇의 자유 텍스트 질문(query)의 일부일 뿐이라 cutoff 필터링
 * 대상이 아니고(기존에도 query는 필터링하지 않았다), 이미 화면에 떠 있는 본문이라 R3와도
 * 충돌하지 않는다. "추천 질문 칩"은 여전히 만들지 않았다 — CLAUDE.md 9장이
 * **미결(데모 시연 시나리오)** 로 둔 항목이라 지어내면 잘못된 결정이 코드에 굳는다.
 */
export default function ChatbotTab({
  answer = '',
  streaming,
  error,
  quote,
  onAsk,
  turns,
  conversations,
  historyOpen = false,
  onToggleHistory,
  onNewChat,
  onSelectConversation,
}: {
  /** 구경로 전용(테스트 호환). turns를 쓰는 실제 화면에서는 전달하지 않는다 */
  answer?: string;
  streaming: boolean;
  error: string | null;
  /** 본문에서 드래그로 인용한 문장. token 이 바뀔 때마다 입력창을 새로 채운다 */
  quote?: { text: string; token: number } | null;
  onAsk: (query: string, quote?: string) => void;
  /** 현재 열려 있는 대화의 전체 문답. 부모(Reader)가 이력 기능을 연결했을 때만 온다 */
  turns?: ChatbotConversationTurn[];
  /** 이력 목록 — historyOpen 일 때만 그려진다 */
  conversations?: ChatbotConversationSummary[];
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  onNewChat?: () => void;
  onSelectConversation?: (conversationId: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * 다음 질문에 실어 보낼 인용문. 입력창엔 사용자가 편집할 수 있는 표시용 텍스트만
   * 채우고, 실제로 서버 프롬프트에 "본문 인용" 근거로 들어갈 원문은 여기 그대로 둔다 —
   * 입력창을 고쳐 써도(질문을 덧붙이거나 따옴표를 지워도) 원문 자체는 바뀌지 않는다.
   */
  const [attachedQuote, setAttachedQuote] = useState<string | null>(null);

  useEffect(() => {
    if (!quote) return;
    setQuery(`"${quote.text}" `);
    setAttachedQuote(quote.text);
    inputRef.current?.focus();
  }, [quote?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasHistoryFeature = Boolean(onToggleHistory && onNewChat);
  /**
   * turns가 오면 그게 유일한 진실이다 — 부모(useChatConversation)가 스트리밍 중인
   * 답변까지 이 배열의 마지막 원소로 갱신해 준다. 없으면(구경로) 로컬 asked/answer로 그린다.
   */
  const bubbles: ChatbotConversationTurn[] =
    turns ?? [
      ...(asked ? [{ role: 'user' as const, text: asked }] : []),
      ...(answer ? [{ role: 'assistant' as const, text: answer }] : []),
    ];

  return (
    <div className="flex h-full flex-col">
      {hasHistoryFeature ? (
        <div className="mb-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onToggleHistory}
            aria-pressed={historyOpen}
            className="rounded-pill border border-line-subtle bg-surface px-3 py-1.5 text-[11px] font-bold text-muted"
          >
            지난 대화
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className="rounded-pill border border-line-subtle bg-surface px-3 py-1.5 text-[11px] font-bold text-muted"
          >
            새 채팅
          </button>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="flex-1 overflow-y-auto">
          {conversations && conversations.length > 0 ? (
            <ul className="space-y-1.5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation?.(c.id)}
                    className="flex w-full flex-col rounded-card px-3 py-2 text-left hover:bg-canvas"
                  >
                    <span className="truncate text-xs text-ink">{c.title || '(질문 없음)'}</span>
                    <span className="text-[10px] text-faint">{c.conversation_date}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-faint">아직 나눈 대화가 없습니다</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto">
            {bubbles.map((turn, i) =>
              turn.role === 'user' ? (
                <p
                  key={i}
                  className="ml-auto max-w-[80%] rounded-card bg-canvas px-4 py-2.5 text-xs text-ink"
                >
                  {turn.text}
                </p>
              ) : (
                <p
                  key={i}
                  className="mr-auto max-w-[85%] whitespace-pre-wrap rounded-card bg-ssabi-soft px-4 py-2.5 text-xs leading-relaxed text-ink"
                >
                  {turn.text}
                </p>
              )
            )}

            {error ? (
              <p role="alert" className="text-xs text-muted">
                {error}
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
              onAsk(query.trim(), attachedQuote ?? undefined);
              setAsked(query.trim());
              setQuery('');
              setAttachedQuote(null);
            }}
          >
            <label htmlFor="chat-query" className="sr-only">
              질문
            </label>
            <input
              id="chat-query"
              ref={inputRef}
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
        </>
      )}
    </div>
  );
}
