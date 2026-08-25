/**
 * 지난 대화 목록의 시간 표시 — 최근이면 상대 시간("3분 전"), 아니면 절대 날짜.
 *
 * `updated_at`은 실제 타임스탬프다(백엔드 `now()`, ISO 문자열 — conversation-service.ts)
 * — 상대 시간 계산에 쓸 수 있다. `conversation_date`는 계약상 "KST 자정 기준 캘린더
 * 날짜"(YYYY-MM-DD)뿐이라 분·시간 단위 상대 시간을 낼 수 없다(지어내지 않는다,
 * CLAUDE.md 6장). `updated_at`이 비어 있거나 파싱이 안 되면(구 테스트 픽스처처럼)
 * `conversation_date`로 조용히 물러난다 — 예전 동작(날짜 10자만 방어적으로 자름)을
 * 그대로 유지해, 실제 타임스탬프가 없는 상황에서도 화면이 깨지지 않는다.
 */
export function formatConversationTimestamp(
  conversationDate: string,
  updatedAt: string,
  now: Date = new Date()
): string {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return conversationDate.slice(0, 10);
  }

  const diffMin = Math.floor((now.getTime() - updated.getTime()) / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;

  return conversationDate.slice(0, 10);
}
