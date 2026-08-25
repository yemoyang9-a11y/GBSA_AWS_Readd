import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatbotConversationSummary, ChatbotConversationTurn } from '../../types';
import ssabiFace from '../../assets/images/ssabi-face.png';
import { splitMarkdownBold } from './parseMarkdownBold';
import { formatConversationTimestamp } from './formatConversationTime';

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
 * 선택 문장 인용 — 본문·리캡에서 드래그로 고른 문장이 `quote` prop 으로 오면 입력창은
 * 건드리지 않고(2026-08-25, 사용자 요청 — 예전엔 입력창에 `"인용문" ` 형태로 자동
 * 채웠는데, 그러면 사용자가 직접 타이핑한 질문과 섞여 헷갈렸다) "선택한 문장" 카드로만
 * 보여주고, 다음 질문에 조용히 딸려 보낼 원문을 `attachedQuote`에 둔다. 인용문은 챗봇의
 * 자유 텍스트 질문(query)의 일부일 뿐이라 cutoff 필터링 대상이 아니고(기존에도 query는
 * 필터링하지 않았다), 이미 화면에 떠 있는 본문/리캡이라 R3와도 충돌하지 않는다.
 * "추천 질문 칩"은 여전히 만들지 않았다 — CLAUDE.md 9장이 **미결(데모 시연 시나리오)**
 * 로 둔 항목이라 지어내면 잘못된 결정이 코드에 굳는다.
 *
 * 지난 대화 삭제 (2026-08-25, 사용자 요청) — 목록 각 항목에 휴지통 버튼을 둔다.
 * 클릭 시 onSelectConversation으로 안 새지 않게 stopPropagation한다. 실제 삭제·목록
 * 갱신은 부모(useChatConversation.deleteConversation)가 맡는다 — 이 컴포넌트는 어느
 * id를 지울지만 올려보낸다.
 *
 * 선택 문장 고정 표시 (2026-08-24, 사용자 요청) — 인용이 들어오면 대화 목록 맨 위에
 * "선택한 문장" 카드로 원문을 계속 띄워 둔다. 질문을 보내면 `attachedQuote`는 그 한
 * 번의 질문에만 쓰이고 비워지지만(기존 동작 유지), 이 카드는 그 뒤로 이어지는 후속
 * 질문들이 여전히 이 문장을 두고 하는 대화라는 걸 보여주려고 세션 동안 남는다 — 새
 * 문장을 다시 드래그하거나 "새 채팅"/다른 대화 선택으로 넘어가면 지운다. 카드 우측
 * ×버튼(2026-08-25, 사용자 요청)으로도 직접 해제할 수 있다 — 아직 안 보낸 인용
 * (`attachedQuote`)도 같이 지워서, 해제한 뒤 보내는 질문엔 그 문장이 조용히 딸려가지
 * 않는다. key={pinnedQuote} + animate-tab-in(2026-08-25, 사용자 요청 — "거칠게 뜬다")로
 * 새 문장을 인용할 때마다(문장이 다르면 key가 바뀌어 리마운트) 살짝 떠오르며 나타난다.
 * sticky top-0(2026-08-25, 사용자 요청 — 스크롤해도 배너처럼 안 밀려 올라가게)로
 * 대화를 스크롤해도 이 카드만 스크롤 영역 맨 위에 계속 붙어 있는다 — 배경이 불투명해
 * (bg-brief-accent-soft) 뒤로 지나가는 말풍선을 가려 준다. 지워지는 세 자리(×·새 채팅·
 * 다른 대화 선택) 모두 onQuoteDismissed도 같이 불러서(2026-08-25, 사용자 요청 — 본문에도
 * 인용문을 하이라이트하기 시작하며 추가), 부모(Reader.tsx)가 본문 하이라이트를 이
 * 카드와 같은 타이밍에 지울 수 있게 한다.
 *
 * 답변 말풍선 테두리는 brief-accent(남보라) 대신 `progress` 토큰(남색 #35536b)을
 * 쓴다(2026-08-25, 사용자 요청) — 진도 바 색상 통일 때 고른 색을 챗봇에도 재사용해
 * 화면 간 강조색을 맞췄다.
 *
 * 싸비 답변의 "**굵게**"를 실제로 굵게 렌더한다(2026-08-25, 사용자 요청 — 별표가
 * 글자 그대로 보이던 문제). parseMarkdownBold.ts 참고. 사용자 말풍선(turn.text 그대로)
 * 에는 적용하지 않는다 — 사용자가 입력한 텍스트를 마크다운으로 재해석할 이유가 없다.
 *
 * ## 지난 대화 화면 재설계 (2026-08-25, 사용자 요청 — "지난 대화-챗봇의 구분을 줘야
 * 하겠어")
 *
 * 예전엔 헤더의 "지난 대화"/"새 채팅" 버튼 두 개가 historyOpen과 무관하게 항상 그대로
 * 있었다 — 아래 목록 내용만 바뀌어서, 버튼만 봐서는 지금 어느 화면인지 구분이 안 됐다.
 * 지금은 헤더 자체가 상태에 따라 달라진다: 채팅 화면에선 "지난 대화"/"새 채팅" 버튼
 * 쌍이, 이력 화면에선 그 대신 accent 색 "← 채팅으로" 버튼 하나 + "지난 대화 N" 라벨이
 * 뜬다. 색이 바뀐 버튼 자체가 "지금 다른 화면에 있다"는 신호이자 돌아가는 길이다.
 *
 * 목록 항목도 인물 카드(RelationshipTab.tsx)와 같은 카드 레시피(rounded-xl border
 * bg-white)로 맞췄다 — 예전엔 테두리 없는 밋밋한 행이었다.
 *
 * 시간 표시는 `conversation_date`(날짜만) 대신 `updated_at`(실제 타임스탬프) 기준
 * 상대 시간을 쓴다(2026-08-25, 사용자 요청 — "최근 대화는 분 또는 시간으로"). 자세한
 * 규칙·폴백은 formatConversationTime.ts 참고.
 *
 * 삭제는 두 단계다 — 처음 누르면 그 버튼만 "삭제?"로 바뀌고(accent 색), 3초 안에 다시
 * 누르면 실제로 지운다. 시간이 지나면 원래 아이콘으로 되돌아간다. 이 앱 팔레트엔 별도
 * "위험" 색(빨강 등)이 없어서 새 색을 끌어오는 대신 기존 accent 톤을 재사용했다 — 즉시
 * 삭제되던 예전 동작은 되돌릴 방법이 없어 실수로 누르기 쉬웠다.
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
  onDeleteConversation,
  onQuoteDismissed,
  onRefreshCurrentPage,
}: {
  /** 구경로 전용(테스트 호환). turns를 쓰는 실제 화면에서는 전달하지 않는다 */
  answer?: string;
  streaming: boolean;
  error: string | null;
  /** 본문·리캡에서 드래그로 인용한 문장. token 이 바뀔 때마다 "선택한 문장" 카드를 새로 채운다 */
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
  /** 지난 대화 삭제 (2026-08-25, 사용자 요청). historyOpen일 때만 그려지는 목록 각 항목의
   *  삭제 버튼에 연결된다. */
  onDeleteConversation?: (conversationId: number) => void;
  /** 선택한 문장이 지워질 때(×·새 채팅·다른 대화 선택)마다 호출된다(2026-08-25, 사용자
   *  요청). Reader.tsx가 본문 하이라이트를 이 콜백에 맞춰 같이 지운다 — "선택한 문장"
   *  카드와 본문 하이라이트가 서로 다른 상태로 갈라지지 않게 한다. */
  onQuoteDismissed?: () => void;
  /** 현재 페이지 진도를 서버에 다시 커밋해, 다음 질문이 최신 cutoff을 쓰게 한다. */
  onRefreshCurrentPage?: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const previousUserMessageCountRef = useRef<number | null>(null);
  /**
   * 다음 질문에 실어 보낼 인용문. 입력창엔 안 보인다(2026-08-25) — 사용자가 직접 타이핑한
   * 질문 위에 조용히 얹혀서, 서버 프롬프트엔 "본문 인용" 근거로 같이 들어간다.
   */
  const [attachedQuote, setAttachedQuote] = useState<string | null>(null);
  /** 대화 목록 맨 위 "선택한 문장" 카드에 계속 띄워 둘 원문. 질문을 보내도 비우지 않는다 —
   *  후속 질문들이 여전히 이 문장을 두고 하는 대화라는 걸 보여줘야 하기 때문. */
  const [pinnedQuote, setPinnedQuote] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<'idle' | 'refreshing' | 'done' | 'failed'>(
    'idle'
  );
  /** setPinnedQuote(null) 세 자리(×·새 채팅·다른 대화 선택) 모두 이걸로 통일한다 —
   *  onQuoteDismissed 호출을 한 곳에서만 관리해 빠뜨리는 자리가 생기지 않게 한다. */
  const clearPinnedQuote = () => {
    setPinnedQuote(null);
    onQuoteDismissed?.();
  };

  useEffect(() => {
    if (!quote) {
      setAttachedQuote(null);
      setPinnedQuote(null);
      return;
    }
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

  /**
   * 삭제 2단계 확인 — 처음 누른 항목의 id만 담아둔다. 같은 id를 다시 누르면 실제
   * 삭제를, 다른 항목을 누르면 그 항목이 새로 무장(armed)된다(이전 무장은 자동 해제).
   * 3초 안에 다시 안 누르면 타이머로 스스로 풀린다.
   */
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const confirmDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
  }, []);
  function handleDeleteClick(id: number) {
    if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
    if (confirmDeleteId === id) {
      setConfirmDeleteId(null);
      onDeleteConversation?.(id);
      return;
    }
    setConfirmDeleteId(id);
    confirmDeleteTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  }

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
  const hasBubbles = bubbles.length > 0;
  const latestBubbleText = bubbles[bubbles.length - 1]?.text;
  const userMessageCount = bubbles.filter((bubble) => bubble.role === 'user').length;

  useLayoutEffect(() => {
    const userMessageWasAdded =
      previousUserMessageCountRef.current !== null && userMessageCount > previousUserMessageCountRef.current;
    previousUserMessageCountRef.current = userMessageCount;

    if (!hasBubbles) return;

    const messages = messagesRef.current;
    if (!messages) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const scrollOptions = {
      top: messages.scrollHeight,
      behavior: userMessageWasAdded && !reduceMotion ? 'smooth' : 'auto',
    } as const;

    if (typeof messages.scrollTo === 'function') {
      messages.scrollTo(scrollOptions);
    } else {
      messages.scrollTop = messages.scrollHeight;
    }
  }, [hasBubbles, latestBubbleText, streaming, userMessageCount]);

  return (
    <div className="flex h-full flex-col">
      {hasHistoryFeature || onRefreshCurrentPage ? (
        hasHistoryFeature && historyOpen ? (
          // 이력 화면 헤더 — accent 색 "뒤로" 버튼 하나로 채팅 화면과 시각적으로 다르게
          // 만든다(클래스 주석 "지난 대화 화면 재설계" 참고). 버튼 색 자체가 "지금 다른
          // 화면에 있다"는 신호이자 돌아가는 길이다.
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleHistory}
              aria-pressed={true}
              className="flex items-center gap-1 rounded-full border border-brief-accent bg-brief-accent-soft px-3 py-1.5 font-dashSans text-[11px] font-bold text-brief-accent"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
                <path
                  d="M15 5 8 12l7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              채팅으로
            </button>
            <span className="font-dashSans text-[11px] font-bold text-brief-muted">
              지난 대화 {conversations?.length ?? 0}
            </span>
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            {onRefreshCurrentPage ? (
              <button
                type="button"
                disabled={refreshState === 'refreshing'}
                onClick={async () => {
                  setRefreshState('refreshing');
                  try {
                    await onRefreshCurrentPage();
                    setRefreshState('done');
                  } catch {
                    setRefreshState('failed');
                  }
                }}
                className="rounded-full border border-progress bg-white px-3 py-1.5 font-dashSans text-[11px] font-bold text-progress disabled:opacity-50"
              >
                {refreshState === 'refreshing' ? '반영 중…' : '현재 페이지 반영'}
              </button>
            ) : null}
            {hasHistoryFeature ? (
              <>
                <button
                  type="button"
                  onClick={onToggleHistory}
                  aria-pressed={false}
                  className="flex items-center gap-1 rounded-full border border-brief-rule bg-white px-3 py-1.5 font-dashSans text-[11px] font-bold text-brief-muted"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
                    <path
                      d="M12 8v4l3 2"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  지난 대화
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearPinnedQuote();
                    onNewChat?.();
                  }}
                  className="rounded-full border border-brief-rule bg-white px-3 py-1.5 font-dashSans text-[11px] font-bold text-brief-muted"
                >
                  새 채팅
                </button>
              </>
            ) : null}
            {refreshState === 'done' ? (
              <span aria-live="polite" className="w-full text-right text-[11px] text-brief-muted">
                현재 페이지가 반영됐어요.
              </span>
            ) : null}
            {refreshState === 'failed' ? (
              <span role="alert" className="w-full text-right text-[11px] text-brief-muted">
                현재 페이지 반영에 실패했어요. 다시 시도해 주세요.
              </span>
            ) : null}
          </div>
        )
      ) : null}

      {historyOpen ? (
        <div className="brief-scroll flex-1 overflow-y-auto">
          {conversations && conversations.length > 0 ? (
            <ul className="space-y-2">
              {conversations.map((c) => {
                const confirming = confirmDeleteId === c.id;
                return (
                  // 인물 카드(RelationshipTab.tsx)와 같은 카드 레시피 — 클래스 주석
                  // "지난 대화 화면 재설계" 참고.
                  <li
                    key={c.id}
                    className="flex items-center gap-1 rounded-xl border border-brief-rule bg-white"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        clearPinnedQuote();
                        onSelectConversation?.(c.id);
                      }}
                      className="flex min-w-0 flex-1 flex-col px-3.5 py-2.5 text-left"
                    >
                      <span className="truncate font-dashSerif text-sm font-bold text-brief-ink">
                        {c.title || '(질문 없음)'}
                      </span>
                      <span className="font-dashMono text-[10px] text-brief-muted">
                        {formatConversationTimestamp(c.conversation_date, c.updated_at)}
                      </span>
                    </button>
                    {onDeleteConversation ? (
                      <button
                        type="button"
                        aria-label={confirming ? '정말 삭제하려면 다시 누르세요' : '대화 삭제'}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteClick(c.id);
                        }}
                        className={
                          confirming
                            ? 'mr-1.5 shrink-0 rounded-full bg-brief-accent px-2.5 py-1 font-dashSans text-[10px] font-bold text-white'
                            : 'mr-1.5 shrink-0 rounded-full p-1.5 text-brief-muted hover:bg-brief-paper hover:text-brief-ink'
                        }
                      >
                        {confirming ? (
                          '삭제?'
                        ) : (
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
                            <path
                              d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.867 12.142A2 2 0 0 1 14.138 21H9.862a2 2 0 0 1-1.995-1.858L7 7"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-brief-muted">아직 나눈 대화가 없습니다</p>
          )}
        </div>
      ) : (
        <>
          <div ref={messagesRef} className="brief-scroll flex-1 space-y-3 overflow-y-auto">
            {pinnedQuote ? (
              <div
                key={pinnedQuote}
                className="sticky top-0 z-10 flex animate-tab-in items-start justify-between gap-2 border-l-2 border-brief-accent bg-brief-accent-soft py-2 pl-3 pr-2"
              >
                <div>
                  <p className="mb-1 font-dashSans text-[11px] font-bold text-brief-accent">
                    선택한 문장
                  </p>
                  <p className="whitespace-pre-wrap font-serif text-xs leading-[1.6] text-brief-ink">
                    “{pinnedQuote}”
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="선택한 문장 해제"
                  onClick={() => {
                    clearPinnedQuote();
                    setAttachedQuote(null);
                  }}
                  className="shrink-0 rounded-full p-1 text-brief-accent hover:bg-brief-accent/10"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
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
                <p className="w-fit max-w-[76%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-progress bg-white px-[13px] py-[9px] text-xs leading-[1.6] text-brief-ink">
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
                    <p className="w-fit max-w-[76%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-progress bg-white px-[13px] py-[9px] text-xs leading-[1.6] text-brief-ink">
                      {splitMarkdownBold(turn.text).map((segment, j) =>
                        segment.bold ? (
                          <b key={j} className="font-bold">
                            {segment.text}
                          </b>
                        ) : (
                          segment.text
                        )
                      )}
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
              placeholder="스포일러 없이 답해줄게요, 궁금한 걸 물어보세요"
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
