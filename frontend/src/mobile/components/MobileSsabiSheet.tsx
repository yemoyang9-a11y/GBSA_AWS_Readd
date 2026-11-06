import type { PointerEvent, ReactNode } from 'react';

function dismissKeyboard(e: PointerEvent<HTMLDivElement>) {
  const active = document.activeElement;
  if (!(active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) return;
  if ((e.target as Element).closest('form, input, textarea')) return;
  active.blur();
}

// FR-SVB-003 NFR-USE
export default function MobileSsabiSheet({
  open,
  height,
  offsetTop,
  keyboardOpen,
  children,
}: {
  open: boolean;
  height: number;
  offsetTop: number;
  keyboardOpen: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      id="ssabi-panel"
      data-testid="mobile-ssabi"
      data-mobile="true"
      onPointerDown={dismissKeyboard}
      className="fixed inset-x-0 z-40 flex flex-col overflow-hidden bg-brief-paper"
      style={{
        top: offsetTop,
        height,
        paddingTop: 'var(--safe-top)',
        paddingBottom: keyboardOpen ? 0 : 'var(--safe-bottom)',
      }}
    >
      {children}
    </div>
  );
}
