/**
 * 챗봇 대화 이력 테스트 (R3 소유)
 *
 * 2026-08-24 사용자·R2 조율 결정 3가지를 검증한다:
 * - 하루(KST 자정) 경계로 자동 새 대화 롤오버
 * - "새 채팅"(conversationId 없이 요청) → 항상 새 대화
 * - 봉인: 대화의 cutoff_page가 현재 K보다 크면(뒤로 페이지 이동) 목록·상세에서 통째로 숨김
 *
 * 숨김(negative)과 노출(positive)을 반드시 쌍으로 확인한다 (CLAUDE.md 7장 테스트 규칙) —
 * 숨김만 확인하면 조회가 항상 빈 결과를 반환해도 테스트가 통과해버린다.
 */

import {
  resolveConversation,
  kstDateString,
  listConversations,
  getConversationDetail,
  deleteConversation,
  recordTurns,
  getConversationContext,
} from '../conversation-service';
import * as repo from '../conversation-repository';

jest.mock('../conversation-repository');

const DEVICE_ID = 'device-abc';
const BOOK_ID = 'takryu-vol1';

function row(overrides: Partial<repo.ConversationRow> = {}): repo.ConversationRow {
  return {
    id: 1,
    device_id: DEVICE_ID,
    book_id: BOOK_ID,
    conversation_date: kstDateString(),
    cutoff_page: 40,
    title: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('resolveConversation — 대화 이어가기/롤오버/새 채팅', () => {
  test('conversationId 없이 요청 → 새 대화 생성 ("새 채팅" 버튼 경로)', async () => {
    (repo.createConversation as jest.Mock).mockResolvedValue(row({ id: 99 }));

    const result = await resolveConversation(DEVICE_ID, BOOK_ID, 40, undefined);

    expect(result).toEqual({ conversationId: 99, isNew: true });
    expect(repo.getConversationById).not.toHaveBeenCalled();
    expect(repo.createConversation).toHaveBeenCalledWith(
      DEVICE_ID,
      BOOK_ID,
      40,
      kstDateString()
    );
  });

  test('같은 KST 날짜의 conversationId 요청 → 이어가고 봉인 기준점을 래칫', async () => {
    (repo.getConversationById as jest.Mock).mockResolvedValue(
      row({ id: 5, conversation_date: kstDateString() })
    );

    const result = await resolveConversation(DEVICE_ID, BOOK_ID, 90, 5);

    expect(result).toEqual({ conversationId: 5, isNew: false });
    expect(repo.ratchetCutoff).toHaveBeenCalledWith(5, 90);
    expect(repo.createConversation).not.toHaveBeenCalled();
  });

  test('하루가 지난 conversationId 요청 → 자동으로 새 대화로 롤오버', async () => {
    (repo.getConversationById as jest.Mock).mockResolvedValue(
      row({ id: 5, conversation_date: '2020-01-01' }) // 과거 날짜
    );
    (repo.createConversation as jest.Mock).mockResolvedValue(row({ id: 6 }));

    const result = await resolveConversation(DEVICE_ID, BOOK_ID, 40, 5);

    expect(result).toEqual({ conversationId: 6, isNew: true });
    expect(repo.ratchetCutoff).not.toHaveBeenCalled();
  });

  test('존재하지 않는(다른 디바이스 소유 포함) conversationId 요청 → 새 대화로 대체', async () => {
    (repo.getConversationById as jest.Mock).mockResolvedValue(null);
    (repo.createConversation as jest.Mock).mockResolvedValue(row({ id: 7 }));

    const result = await resolveConversation(DEVICE_ID, BOOK_ID, 40, 999);

    expect(result).toEqual({ conversationId: 7, isNew: true });
  });
});

describe('listConversations / getConversationDetail — 봉인 규칙 (positive/negative 쌍)', () => {
  test('negative: 봉인 기준점(90)이 현재 K(40)보다 크면 상세 조회가 숨겨짐(null)', async () => {
    (repo.getConversationById as jest.Mock).mockResolvedValue(row({ id: 1, cutoff_page: 90 }));

    const detail = await getConversationDetail(DEVICE_ID, BOOK_ID, 1, 40);

    expect(detail).toBeNull();
    expect(repo.listTurns).not.toHaveBeenCalled();
  });

  test('positive: 현재 K(130)가 봉인 기준점(90) 이상이면 같은 대화가 정상 노출됨', async () => {
    (repo.getConversationById as jest.Mock).mockResolvedValue(row({ id: 1, cutoff_page: 90 }));
    (repo.listTurns as jest.Mock).mockResolvedValue([
      { id: 1, conversation_id: 1, turn_no: 1, role: 'user', text: '정주사가 누구인가요?', created_at: new Date() },
      { id: 2, conversation_id: 1, turn_no: 2, role: 'assistant', text: '고무신 장사입니다.', created_at: new Date() },
    ]);

    const detail = await getConversationDetail(DEVICE_ID, BOOK_ID, 1, 130);

    expect(detail).not.toBeNull();
    expect(detail?.turns).toEqual([
      { role: 'user', text: '정주사가 누구인가요?' },
      { role: 'assistant', text: '고무신 장사입니다.' },
    ]);
  });

  test('listConversations는 봉인 기준점 <= K인 대화만 반환하도록 repository에 K를 그대로 전달', async () => {
    (repo.listConversations as jest.Mock).mockResolvedValue([row({ id: 1, cutoff_page: 40 })]);

    const result = await listConversations(DEVICE_ID, BOOK_ID, 40);

    expect(repo.listConversations).toHaveBeenCalledWith(DEVICE_ID, BOOK_ID, 40);
    expect(result).toHaveLength(1);
  });
});

/**
 * 대화 삭제 (2026-08-25, 사용자 요청) — device_id·book_id까지 걸어 소유자 확인을
 * 겸한다. positive(내 소유 → 삭제됨)/negative(남의 소유·존재하지 않음 → 삭제 안 됨)
 * 쌍으로 확인한다.
 */
describe('deleteConversation — 소유자 확인 (positive/negative 쌍)', () => {
  test('positive: 내 device_id·book_id 소유의 대화는 삭제된다', async () => {
    (repo.deleteConversation as jest.Mock).mockResolvedValue(true);

    const result = await deleteConversation(DEVICE_ID, BOOK_ID, 1);

    expect(repo.deleteConversation).toHaveBeenCalledWith(DEVICE_ID, BOOK_ID, 1);
    expect(result).toBe(true);
  });

  test('negative: 존재하지 않거나 다른 디바이스 소유면 삭제되지 않는다(false)', async () => {
    (repo.deleteConversation as jest.Mock).mockResolvedValue(false);

    const result = await deleteConversation(DEVICE_ID, BOOK_ID, 999);

    expect(result).toBe(false);
  });
});

/**
 * 대화 맥락 기억 (2026-08-24) — "클로드처럼 지난 대화를 기억하는 context 기반 답변"
 *
 * recordTurns가 turn마다 그 시점 K를 함께 저장하고, getConversationContext는
 * cutoff_page <= 현재 K 인 turn만 돌려준다. 대화를 이어가는 도중 뒤로 페이지 이동한 뒤에도
 * (resolveConversation은 이 경우를 막지 않는다) 예전(더 큰 K) 답변이 새 프롬프트의 맥락으로
 * 새어 들어가지 않도록 막는 필터라 negative/positive를 반드시 쌍으로 확인한다.
 */
describe('recordTurns / getConversationContext — 맥락 재사용 시 cutoff_page 필터', () => {
  test('recordTurns는 사용자·싸비 turn 모두에 그 시점 K를 함께 저장한다', async () => {
    (repo.getMaxTurnNo as jest.Mock).mockResolvedValue(0);

    await recordTurns(1, '정주사가 누구인가요?', '고무신 장사입니다.', 90);

    expect(repo.insertTurn).toHaveBeenNthCalledWith(1, 1, 1, 'user', '정주사가 누구인가요?', 90);
    expect(repo.insertTurn).toHaveBeenNthCalledWith(2, 1, 2, 'assistant', '고무신 장사입니다.', 90);
  });

  test('negative: cutoff_page(90)가 현재 K(40)보다 큰 turn은 맥락에서 빠진다', async () => {
    (repo.listTurnsForContext as jest.Mock).mockResolvedValue([]); // repository가 이미 K로 필터링

    const context = await getConversationContext(1, 40);

    expect(repo.listTurnsForContext).toHaveBeenCalledWith(1, 40);
    expect(context).toEqual([]);
  });

  test('positive: cutoff_page(90)가 현재 K(130) 이하인 turn은 맥락에 포함된다', async () => {
    (repo.listTurnsForContext as jest.Mock).mockResolvedValue([
      {
        id: 1,
        conversation_id: 1,
        turn_no: 1,
        role: 'user',
        text: '정주사가 누구인가요?',
        cutoff_page: 90,
        created_at: new Date(),
      },
      {
        id: 2,
        conversation_id: 1,
        turn_no: 2,
        role: 'assistant',
        text: '고무신 장사입니다.',
        cutoff_page: 90,
        created_at: new Date(),
      },
    ]);

    const context = await getConversationContext(1, 130);

    expect(repo.listTurnsForContext).toHaveBeenCalledWith(1, 130);
    expect(context).toEqual([
      { role: 'user', text: '정주사가 누구인가요?' },
      { role: 'assistant', text: '고무신 장사입니다.' },
    ]);
  });
});
