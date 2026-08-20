import type { ReactNode } from 'react';

/**
 * 공용 버튼 2변형.
 *   solid — 시안의 강조 동작('마저 읽기' 등). ink 배경 + 흰 글씨
 *   pill  — 알약형 보조 동작
 */
export default function Button({
  children,
  onClick,
  variant = 'solid',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'solid' | 'pill';
  disabled?: boolean;
}) {
  const base = 'text-[13px] transition-opacity disabled:opacity-40';
  const shape =
    variant === 'solid'
      ? 'rounded-lg bg-ink px-5 py-2.5 font-bold text-white'
      : 'rounded-pill border border-line-subtle bg-surface px-4 py-2 text-faint';

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${shape}`}>
      {children}
    </button>
  );
}
