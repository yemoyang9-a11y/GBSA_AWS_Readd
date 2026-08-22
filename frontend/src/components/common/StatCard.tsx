/**
 * 통계 카드 — 시안 stat-card (모서리 16px, 패딩 16px, subtle 테두리)
 *
 * `value` 가 문자열도 되는 이유: 판정 데이터 자체가 없는 항목은 숫자를 낼 수 없다.
 * 그런 자리에 `0` 을 넣으면 "측정했더니 0" 이라는 적극적 주장이 되어 없는 사실을
 * 지어내게 된다 — 미측정은 `—` 로 표시한다 (PRODUCT.md 원칙 4번).
 */
export default function StatCard({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-card border border-line-subtle bg-surface p-4">
      <span className="font-serif text-2xl font-bold text-accent">{value}</span>
      <span className="text-xs font-medium text-faint">{label}</span>
    </div>
  );
}
