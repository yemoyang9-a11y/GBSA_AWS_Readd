import { useEffect, useRef, useState } from 'react';
import type { ChatbotConversationSummary, ChatbotConversationTurn, GraphResponse, SsabiTab } from '../../types';
import { resolveSsabiTab } from '../../utils/ssabiTab';
import RecapTab from './RecapTab';
import RelationshipTab from './RelationshipTab';
import ChatbotTab from './ChatbotTab';

const TAB_LABELS: Record<SsabiTab, string> = {
  recap: '리캡',
  relationship: '인물 관계도',
  chatbot: '챗봇',
};

const TAB_ORDER: SsabiTab[] = ['recap', 'relationship', 'chatbot'];

/**
 * 싸비 사이드창 3탭 — S5 (FR-SVB-002·004·005)
 *
 * 이 컴포넌트가 갖는 상태는 "어느 탭이 열려 있는가" 하나다. 조회는 컨테이너가 하고,
 * 페이지 변경 시 재조회(FR-SVB-003)도 그쪽 책임이다.
 * 세션 경계는 서버가 준 session_epoch 의 **변화**로만 판정한다 — 클라이언트가 30분 규칙을
 * 다시 계산하지 않는다 (절대 규칙 8번, 자가 검증 17번).
 * 본문 페이지를 옮기는 수단을 갖지 않아 FR-SVB-005 를 구조로 지킨다.
 */
export default function SsabiPanel({
  sessionEpoch,
  appliedCutoff = null,
  initialTab = null,
  initialTabEpoch = null,
  onTabChange,
  graph,
  graphFailed,
  recapText,
  recapStreaming,
  recapFailed,
  chatTurns,
  chatStreaming,
  chatError,
  chatConversations,
  chatHistoryOpen,
  pendingQuote,
  onAsk,
  onNewChat,
  onToggleChatHistory,
  onSelectChatConversation,
}: {
  sessionEpoch: number;
  /**
   * "Np까지 확인" 배지에 그대로 찍는 페이지 번호(2026-08-24, 사용자 결정 — 지금 보고
   * 있는 페이지를 그대로 보여주는 쪽을 선택함). 컨테이너(Reader)가 서버가 확인해 준
   * 현재 페이지를 그대로 내려준다 — 여기서 계산하지 않는다. 아직 페이지가 없으면 null.
   */
  appliedCutoff?: number | null;
  /**
   * 재마운트 시 이어서 쓸 "마지막 탭" 기억과, 그 값을 기록한 시점의 sessionEpoch
   * (2026-08-24, 사용자 요청 — 패널을 닫았다 열면 항상 기본 탭으로 리셋되던 것을 마지막
   * 이용 탭 유지로 바꿈). 이 컴포넌트는 닫힐 때 Reader가 통째로 언마운트하므로(패널
   * 언마운트 정책 참조, Reader.tsx) 내부 상태만으로는 기억할 수 없다 — 언마운트되지 않는
   * Reader가 대신 들고 있다가 재마운트 시 이 두 값으로 되돌려준다. 아래 sameSession
   * 판정(resolveSsabiTab)에 그대로 흘러 들어가므로, epoch이 안 맞으면(세션이 바뀐 채로
   * 닫혀 있었으면, FR-SVB-004) 자동으로 기본 탭으로 돌아간다 — 별도 분기 없이 기존 로직이
   * 그대로 처리한다. 둘 다 없으면(최초 진입) 기존과 동일하게 기본 탭에서 시작한다.
   */
  initialTab?: SsabiTab | null;
  initialTabEpoch?: number | null;
  onTabChange: (tab: SsabiTab) => void;
  graph: GraphResponse | null;
  graphFailed: boolean;
  recapText: string;
  recapStreaming: boolean;
  recapFailed: boolean;
  chatTurns: ChatbotConversationTurn[];
  chatStreaming: boolean;
  chatError: string | null;
  chatConversations: ChatbotConversationSummary[];
  chatHistoryOpen: boolean;
  /** 본문에서 드래그로 인용한 문장. token 이 바뀔 때마다 챗봇 탭으로 강제 전환한다 */
  pendingQuote?: { text: string; token: number } | null;
  onAsk: (query: string, quote?: string) => void;
  onNewChat: () => void;
  onToggleChatHistory: () => void;
  onSelectChatConversation: (conversationId: number) => void;
}) {
  const [lastTab, setLastTab] = useState<SsabiTab | null>(initialTab);
  const previousEpoch = useRef<number | null>(initialTabEpoch);

  const tab = resolveSsabiTab({
    previousEpoch: previousEpoch.current,
    currentEpoch: sessionEpoch,
    lastTab,
  });

  useEffect(() => {
    if (previousEpoch.current !== sessionEpoch) {
      previousEpoch.current = sessionEpoch;
      setLastTab(null); // 새 세션 — 기본 탭으로 초기화 (FR-SVB-004)
    }
  }, [sessionEpoch]);

  useEffect(() => {
    onTabChange(tab);
  }, [tab, onTabChange]);

  // 본문에서 인용 요청이 올 때마다(token 변화) 챗봇 탭으로 전환한다
  useEffect(() => {
    if (pendingQuote) setLastTab('chatbot');
  }, [pendingQuote?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="flex h-full flex-col border-l border-brief-rule bg-brief-paper">
      {/* 여닫기 버튼은 이 헤더 우측에 겹쳐 보이지만 Reader 가 고정 위치로 그린다 —
          패널이 닫혀도 같은 자리에 남아야 하므로 패널 안에 두지 않는다 */}
      <div className="flex items-center justify-between gap-2 pb-5 pl-6 pr-20 pt-6">
        {/*
         * pr-20(80px) — 여닫기 버튼은 Reader가 이 헤더와 같은 줄, 같은 우측 여백(right-6)에
         * 고정 위치로 그린다(size-9=36px). px-6만 쓰면 이 배지의 오른쪽 끝이 버튼과 정확히
         * 같은 x좌표에서 겹친다 — 버튼 폭(36px) + 여유(20px)만큼 오른쪽을 비워 겹침을 막는다.
         */}
        <h2 className="font-dashSerif text-base font-extrabold text-brief-ink">아모의 가이드북</h2>
        {appliedCutoff !== null ? (
          <span className="shrink-0 rounded-full bg-brief-accent-soft px-2.5 py-1 font-dashMono text-[11px] font-bold text-brief-accent">
            {appliedCutoff}p까지 확인
          </span>
        ) : null}
      </div>

      {/* 탭은 3개다. 시안의 '타임라인'은 만들지 않는다 (00-shared §2.5 "[이후 확장]") */}
      <div role="tablist" aria-label="싸비" className="flex gap-2 px-6">
        {TAB_ORDER.map((it) => (
          <button
            key={it}
            role="tab"
            type="button"
            aria-selected={tab === it}
            onClick={() => setLastTab(it)}
            className={
              tab === it
                ? 'rounded-lg border border-brief-accent bg-brief-accent-soft px-3 py-2 font-dashSans text-xs font-bold text-brief-accent'
                : 'rounded-lg border border-brief-rule px-3 py-2 font-dashSans text-xs text-brief-muted transition-colors hover:border-brief-muted hover:text-brief-ink'
            }
          >
            {TAB_LABELS[it]}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="brief-scroll flex-1 overflow-y-auto px-6 pb-6 pt-5">
        {tab === 'recap' ? (
          <RecapTab
            text={recapText}
            streaming={recapStreaming}
            failed={recapFailed}
            // graph는 이미 기준점 K 이하로 필터된 응답이다(types/ssabi.ts:3) — 리캡 강조가
            // 쓰는 이름 목록도 그 범위를 벗어나지 않는다.
            characterNames={graph ? graph.nodes.flatMap((n) => [n.name, ...n.aliases]) : []}
          />
        ) : null}
        {tab === 'relationship' ? <RelationshipTab graph={graph} failed={graphFailed} /> : null}
        {tab === 'chatbot' ? (
          <ChatbotTab
            turns={chatTurns}
            streaming={chatStreaming}
            error={chatError}
            conversations={chatConversations}
            historyOpen={chatHistoryOpen}
            quote={pendingQuote}
            onAsk={onAsk}
            onNewChat={onNewChat}
            onToggleHistory={onToggleChatHistory}
            onSelectConversation={onSelectChatConversation}
          />
        ) : null}
      </div>
    </section>
  );
}
