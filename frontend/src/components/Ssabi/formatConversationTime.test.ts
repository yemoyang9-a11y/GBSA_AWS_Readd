import { formatConversationTimestamp } from './formatConversationTime';

const NOW = new Date('2026-08-25T12:00:00.000Z');

describe('formatConversationTimestamp — 지난 대화 시간 표시', () => {
  it('1분 미만이면 "방금 전"', () => {
    expect(formatConversationTimestamp('2026-08-25', '2026-08-25T11:59:30.000Z', NOW)).toBe(
      '방금 전'
    );
  });

  it('1분 이상 60분 미만이면 "N분 전"', () => {
    expect(formatConversationTimestamp('2026-08-25', '2026-08-25T11:45:00.000Z', NOW)).toBe(
      '15분 전'
    );
  });

  it('60분 이상 24시간 미만이면 "N시간 전" (positive — 위 분 표시와 짝)', () => {
    expect(formatConversationTimestamp('2026-08-25', '2026-08-25T09:00:00.000Z', NOW)).toBe(
      '3시간 전'
    );
  });

  it('24시간 이상 7일 미만이면 "N일 전"', () => {
    expect(formatConversationTimestamp('2026-08-23', '2026-08-23T12:00:00.000Z', NOW)).toBe(
      '2일 전'
    );
  });

  it('7일 이상이면 절대 날짜(conversation_date)로 돌아간다', () => {
    expect(formatConversationTimestamp('2026-08-10', '2026-08-10T12:00:00.000Z', NOW)).toBe(
      '2026-08-10'
    );
  });

  it('updated_at이 비어 있으면(구 데이터·테스트 픽스처) conversation_date로 물러난다', () => {
    expect(formatConversationTimestamp('2026-08-24', '', NOW)).toBe('2026-08-24');
  });

  it('conversation_date에 타임스탬프가 섞여 와도 날짜 10자만 쓴다', () => {
    expect(formatConversationTimestamp('2026-08-24T00:00:00.000Z', '', NOW)).toBe('2026-08-24');
  });

  it('시계가 살짝 어긋나 updated_at이 미래여도(음수 차이) 깨지지 않는다', () => {
    expect(formatConversationTimestamp('2026-08-25', '2026-08-25T12:00:05.000Z', NOW)).toBe(
      '방금 전'
    );
  });
});
