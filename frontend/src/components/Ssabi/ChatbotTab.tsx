import { useEffect, useRef, useState } from 'react';
import type { ChatbotConversationSummary, ChatbotConversationTurn } from '../../types';
import ssabiFace from '../../assets/images/ssabi-face.png';

/**
 * 챗봇 탭 — SSE 스트리밍 (NFR-PERF-008) — 재설계 2026-08-23 (`.reader-scr .a-thread`)
 *
 * 근거 부재 거절 문구도 일반 delta 로 흘러온다. 프론트는 그것을 보통 답변과 똑같이
 * 렌더하며, 문구를 보고 거절인지 판별하지 않는다 (절대 규칙 7번, FR-QNA-004 🚦).
 *
 * 대화 이력 (2026-08-24, 사용자·R2 조율 결정) — 클로드류 "새 채팅" + 하루(KST) 단위
 * 자동 롤오버. `turns`가 오면 그 대화의 전체 문답을 그리고, 없으면 이전 동작(마지막
 * 문답 한 쌍만 로컬 상태로 표시)으로 남는다 — 부모가 아직 대화 이력을 연결하지 않은
 * 화면(테스트 등)에서도 그대로 동작하도록 하위 호환을 유지한다.
 *
 * 시안은 사용자 말풍선(paper 배경 + rule 테두리)과 싸비 답변(원형 아바타 + panel 배경 +
 * accent 테두리)을 다른 처리로 구분한다 — 정렬만으로는 좁은 패널에서 화자 구분이 약하다는
 * critique P2(2026-08-21) 판단을 그대로 잇는다.
 *
 * 아바타는 텍스트 "싸" 대신 마스코트 이미지를 쓴다(2026-08-24). 답변이 여러 개(대화
 * 이력)여도 답변마다 그린다.
 *
 * 이미지는 public/assets가 아니라 src/assets에 두고 import한다(2026-08-25) — public의
 * 정적 파일은 배포 시 파일명이 안 바뀌는데 CloudFront가 이 경로에 1년 캐시를 걸어서,
 * 이미지를 바꿔도(이번 세션에서만 세 번 있었다: 원본→빨강→오렌지) 이미 한 번 받아본
 * 브라우저는 예전 버전을 계속 캐시에서 꺼내 썼다. src/assets에서 import하면 Vite가
 * 빌드마다 내용 해시를 파일명에 붙여서, 이미지가 바뀔 때 URL 자체가 바뀌어 캐시가
 * 자동으로 무효화된다.
 *
 * 답변 말풍선은 `answer`가 있을 때만 그린다(polish, 2026-08-21) — 예전엔 무조건 그려서
 * 질문을 하기도 전에(챗봇 탭을 열자마자) 속이 빈 말풍선이 떠 있었다.
 *
 * 대화가 하나도 없을 때(새 채팅 직후 · 최초 진입)는 빈 화면 대신 기본 인사 멘트를
 * 보여준다(2026-08-24, 사용자 요청). 위 P2 polish 결정("빈 말풍선 안 그림")과 다른 것은
 * — 그때 없앤 건 텍스트 없는 빈 말풍선이고, 이건 실제 문구가 있는 안내 멘트다.
 *
 * 선택 문장 인용 (2026-08-24) — 본문 드래그로 고른 문장이 `quote` prop 으로 오면 입력창에
 * 그대로 채운다. 인용문은 챗봇의 자유 텍스트 질문(query)의 일부일 뿐이라 cutoff 필터링
 * 대상이 아니고(기존에도 query는 필터링하지 않았다), 이미 화면에 떠 있는 본문이라 R3와도
 * 충돌하지 않는다. "추천 질문 칩"은 여전히 만들지 않았다 — CLAUDE.md 9장이
 * **미결(데모 시연 시나리오)** 로 둔 항목이라 지어내면 잘못된 결정이 코드에 굳는다.
 *
 * 선택 문장 고정 표시 (2026-08-24, 사용자 요청) — 인용이 들어오면 대화 목록 맨 위에
 * "선택한 문장" 카드로 원문을 계속 띄워 둔다. 질문을 보내면 입력창의 `attachedQuote`는
 * 그 한 번의 질문에만 쓰이고 비워지지만(기존 동작 유지), 이 카드는 그 뒤로 이어지는
 * 후속 질문들이 여전히 이 문장을 두고 하는 대화라는 걸 보여주려고 세션 동안 남는다 —
 * 새 문장을 다시 드래그하거나 "새 채팅"/다른 대화 선택으로 넘어가면 지운다.
 */
const DEFAULT_GREETING = '안녕하세요, 아모예요. 지금까지 읽은 내용 안에서 궁금한 걸 물어보세요.';

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /**
   * 다음 질문에 실어 보낼 인용문. 입력창엔 사용자가 편집할 수 있는 표시용 텍스트만
   * 채우고, 실제로 서버 프롬프트에 "본문 인용" 근거로 들어갈 원문은 여기 그대로 둔다 —
   * 입력창을 고쳐 써도(질문을 덧붙이거나 따옴표를 지워도) 원문 자체는 바뀌지 않는다.
   */
  const [attachedQuote, setAttachedQuote] = useState<string | null>(null);
  /** 대화 목록 맨 위 "선택한 문장" 카드에 계속 띄워 둘 원문. 질문을 보내도 비우지 않는다 —
   *  후속 질문들이 여전히 이 문장을 두고 하는 대화라는 걸 보여줘야 하기 때문. */
  const [pinnedQuote, setPinnedQuote] = useState<string | null>(null);

  useEffect(() => {
    if (!quote) return;
    setQuery(`"${quote.text}" `);
    setAttachedQuote(quote.text);
    setPinnedQuote(quote.text);
    inputRef.current?.focus();
  }, [quote?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // 입력창 칸 밖으로 넘어가는 긴 질문은 가로 스크롤 대신 줄바꿈되며 칸이 늘어난다
  // (2026-08-24, 사용자 요청 — 넘치는 텍스트가 "질문" 버튼을 밀어내던 문제).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [query]);

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
            className="rounded-full border border-brief-rule bg-white px-3 py-1.5 font-dashSans text-[11px] font-bold text-brief-muted"
          >
            지난 대화
          </button>
          <button
            type="button"
            onClick={() => {
              setPinnedQuote(null);
              onNewChat?.();
            }}
            className="rounded-full border border-brief-rule bg-white px-3 py-1.5 font-dashSans text-[11px] font-bold text-brief-muted"
          >
            새 채팅
          </button>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="brief-scroll flex-1 overflow-y-auto">
          {conversations && conversations.length > 0 ? (
            <ul className="space-y-1.5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPinnedQuote(null);
                      onSelectConversation?.(c.id);
                    }}
                    className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-white"
                  >
                    <span className="truncate font-dashSans text-xs text-brief-ink">
                      {c.title || '(질문 없음)'}
                    </span>
                    <span className="font-dashMono text-[10px] text-brief-muted">
                      {c.conversation_date}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-brief-muted">아직 나눈 대화가 없습니다</p>
          )}
        </div>
      ) : (
        <>
          <div className="brief-scroll flex-1 space-y-3 overflow-y-auto">
            {pinnedQuote ? (
              <div className="border-l-2 border-brief-accent py-0.5 pl-3">
                <p className="mb-1 font-dashSans text-[11px] font-bold text-brief-accent">
                  선택한 문장
                </p>
                <p className="whitespace-pre-wrap font-serif text-xs italic leading-[1.6] text-brief-ink">
                  “{pinnedQuote}”
                </p>
              </div>
            ) : null}

            {bubbles.length === 0 ? (
              <div className="flex items-end gap-2">
                <img
                  src={ssabiFace}
                  alt=""
                  aria-hidden="true"
                  className="h-9 w-auto shrink-0 translate-y-3 object-contain"
                />
                <p className="w-fit max-w-[76%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-brief-accent bg-white px-[13px] py-[9px] text-xs leading-[1.6] text-brief-ink">
                  {DEFAULT_GREETING}
                </p>
              </div>
            ) : (
              bubbles.map((turn, i) =>
                turn.role === 'user' ? (
                  <p
                    key={i}
                    className="ml-auto w-fit max-w-[76%] rounded-2xl rounded-br-md border border-brief-rule bg-brief-paper px-[13px] py-[9px] text-xs leading-[1.6] text-brief-ink"
                  >
                    {turn.text}
                  </p>
                ) : (
                  <div key={i} className="flex items-end gap-2">
                    <img
                      src={ssabiFace}
                      alt=""
                      aria-hidden="true"
                      className="h-9 w-auto shrink-0 translate-y-3 object-contain"
                    />
                    <p className="w-fit max-w-[76%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-brief-accent bg-white px-[13px] py-[9px] text-xs leading-[1.6] text-brief-ink">
                      {turn.text}
                    </p>
                  </div>
                )
              )
            )}

            {error ? (
              <p role="alert" className="text-xs text-brief-muted">
                {error}
              </p>
            ) : null}

            {streaming ? (
              <span aria-live="polite" className="block text-[11px] text-brief-muted">
                답하는 중
              </span>
            ) : null}
          </div>

          <form
            className="mt-4 flex items-end gap-2 rounded-3xl border border-brief-rule bg-white px-4 py-2.5"
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
            <textarea
              id="chat-query"
              ref={inputRef}
              rows={1}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              className="max-h-32 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-xs leading-[1.6] text-brief-ink outline-none placeholder:text-brief-muted"
              placeholder="읽은 데까지의 내용으로 물어보세요"
            />
            <button
              type="submit"
              disabled={streaming}
              aria-label="질문 보내기"
              className="flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-full bg-brief-accent text-white disabled:opacity-40"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="currentColor"
                aria-hidden="true"
                className="-rotate-45"
              >
                <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </>
      )}
    </div>
  );
}
