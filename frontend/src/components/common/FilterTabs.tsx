/**
 * 알약형 필터 탭 — 시안 tabs-row (모서리 20px, 패딩 16/8)
 *
 * 서버에 상태 필터 파라미터가 없으므로 이 탭은 **클라이언트 필터**다 (스펙 §7 #2).
 * 선택 상태는 호출부가 갖는다 — 이 컴포넌트는 렌더와 통지만 한다.
 */
export default function FilterTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(tab.id)}
            className={
              selected
                ? 'rounded-pill bg-active px-4 py-2 text-[13px] font-bold text-white'
                : 'rounded-pill border border-line-subtle bg-surface px-4 py-2 text-[13px] text-faint'
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
