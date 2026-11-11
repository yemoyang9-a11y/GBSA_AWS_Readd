// FR-PRG-003
let pending: { bookId: string; page: number } | null = null;

export function setPendingJump(bookId: string, page: number): void {
  pending = { bookId, page };
}

export function takePendingJump(bookId: string): number | null {
  const taken = pending;
  pending = null;
  return taken && taken.bookId === bookId ? taken.page : null;
}

export function clearPendingJump(): void {
  pending = null;
}
