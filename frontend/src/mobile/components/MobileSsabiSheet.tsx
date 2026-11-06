import type { ReactNode } from 'react';

// FR-SVB-003
export default function MobileSsabiSheet({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null;
  return (
    <div
      data-testid="mobile-ssabi"
      className="fixed inset-0 z-40 flex h-[100dvh] flex-col overflow-hidden bg-brief-paper"
      style={{
        paddingTop: 'env(safe-area-inset-top, var(--sat, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, var(--sab, 0px))',
      }}
    >
      {children}
    </div>
  );
}
