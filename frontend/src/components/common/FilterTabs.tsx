/**
 * 알약형 필터 탭 — 대시보드 재설계 시안 (2026-08-23, `.dash-scr .filter`)
 *
 * 서버에 상태 필터 파라미터가 없으므로 이 탭은 **클라이언트 필터**다 (스펙 §7 #2).
 * 선택 상태는 호출부가 갖는다 — 이 컴포넌트는 렌더와 통지만 한다.
 * 현재 대시보드 외 소비자가 없어(2026-08-23 grep 확인) 값을 대시보드 톤으로 바로 바꾼다.
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
    <div className="flex gap-1.5">
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
                ? 'rounded-[18px] border border-dash-ink bg-dash-ink px-3 py-2 font-dashSans text-xs text-white'
                : 'rounded-[18px] border border-dash-line bg-transparent px-3 py-2 font-dashSans text-xs text-dash-muted'
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
