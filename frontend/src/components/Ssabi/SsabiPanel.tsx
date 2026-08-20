import { useEffect, useRef, useState } from 'react';
import type { SsabiTab } from '../../types';
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
 * 싸비 사이드창 3탭 — S5 (FR-SVB-002·003·004·005)
 *
 * 최초 열기 기본 탭은 인물 관계도이며, 세션이 바뀌면 기본 탭으로 초기화한다.
 * 세션 경계는 서버가 준 session_epoch 의 **변화**로만 판정한다 — 클라이언트가 30분 규칙을
 * 다시 계산하지 않는다 (절대 규칙 8번, 자가 검증 17번).
 * 페이지가 바뀌면 열려 있는 탭만 재조회한다 (FR-SVB-003).
 * 이 컴포넌트는 본문 페이지를 옮기는 수단을 갖지 않는다 — 싸비 조작이 읽던 위치를 바꾸지
 * 않는다는 규칙을 구조로 지킨다 (FR-SVB-005).
 */
export default function SsabiPanel({
  currentPage,
  sessionEpoch,
  onTabDataNeeded,
}: {
  currentPage: number;
  sessionEpoch: number;
  onTabDataNeeded: (tab: SsabiTab, page: number) => void;
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
    onTabDataNeeded(tab, currentPage);
  }, [tab, currentPage, onTabDataNeeded]);

  return (
    <section className="flex h-full flex-col border-l">
      <div role="tablist" aria-label="싸비" className="flex border-b">
        {TAB_ORDER.map((it) => (
          <button
            key={it}
            role="tab"
            type="button"
            aria-selected={tab === it}
            onClick={() => setLastTab(it)}
            className="flex-1 p-2"
          >
            {TAB_LABELS[it]}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex-1 overflow-y-auto">
        {tab === 'recap' ? <RecapTab /> : null}
        {tab === 'relationship' ? <RelationshipTab /> : null}
        {tab === 'chatbot' ? <ChatbotTab /> : null}
      </div>
    </section>
  );
}
