/** 통계 카드 — 시안 stat-card (모서리 16px, 패딩 16px, subtle 테두리) */
export default function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-card border border-line-subtle bg-surface p-4">
      <span className="font-serif text-2xl font-bold text-accent">{value}</span>
      <span className="text-xs font-medium text-faint">{label}</span>
    </div>
  );
}
