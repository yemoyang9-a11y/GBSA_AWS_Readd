import { useEffect, useRef, useState } from 'react';
import type { GraphResponse, SsabiTab } from '../../types';
import { resolveSsabiTab } from '../../utils/ssabiTab';
import SsabiToggleButton from '../common/SsabiToggleButton';
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
  onClose,
  onTabChange,
  graph,
  graphFailed,
  recapText,
  recapStreaming,
  recapFailed,
  chatAnswer,
  chatStreaming,
  chatError,
  onAsk,
}: {
  sessionEpoch: number;
  onClose: () => void;
  onTabChange: (tab: SsabiTab) => void;
  graph: GraphResponse | null;
  graphFailed: boolean;
  recapText: string;
  recapStreaming: boolean;
  recapFailed: boolean;
  chatAnswer: string;
  chatStreaming: boolean;
  chatError: string | null;
  onAsk: (query: string) => void;
}) {
  const [lastTab, setLastTab] = useState<SsabiTab | null>(null);
  const previousEpoch = useRef<number | null>(null);

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

  return (
    <section className="flex h-full flex-col border-l border-line bg-surface">
      <div className="flex items-center justify-between px-6 pb-5 pt-6">
        <h2 className="font-serif text-base font-extrabold text-ink">싸비의 가이드북</h2>
        <SsabiToggleButton open onToggle={onClose} />
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
                ? 'rounded-cover border border-ssabi bg-ssabi-soft px-3 py-2 text-xs font-bold text-ssabi'
                : 'rounded-cover border border-transparent px-3 py-2 text-xs text-muted'
            }
          >
            {TAB_LABELS[it]}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex-1 overflow-y-auto px-6 pb-6 pt-5">
        {tab === 'recap' ? (
          <RecapTab text={recapText} streaming={recapStreaming} failed={recapFailed} />
        ) : null}
        {tab === 'relationship' ? <RelationshipTab graph={graph} failed={graphFailed} /> : null}
        {tab === 'chatbot' ? (
          <ChatbotTab
            answer={chatAnswer}
            streaming={chatStreaming}
            error={chatError}
            onAsk={onAsk}
          />
        ) : null}
      </div>
    </section>
  );
}
