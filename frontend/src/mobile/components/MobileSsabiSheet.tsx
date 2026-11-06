import type { PointerEvent, ReactNode } from 'react';

function dismissKeyboard(e: PointerEvent<HTMLDivElement>) {
  const active = document.activeElement;
  if (!(active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) return;
  if ((e.target as Element).closest('form')) return;
  active.blur();
}

// FR-SVB-003 NFR-USE
export default function MobileSsabiSheet({
  open,
  height,
  offsetTop,
  children,
}: {
  open: boolean;
  height: number;
  offsetTop: number;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      data-testid="mobile-ssabi"
      onPointerDown={dismissKeyboard}
      className="fixed inset-x-0 z-40 flex flex-col overflow-hidden bg-brief-paper"
      style={{
        top: offsetTop,
        height,
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {children}
    </div>
  );
}
