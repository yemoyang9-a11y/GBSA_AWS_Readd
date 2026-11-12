const LOGIN_RETURN_KEY = 'ssabi.login_return_book';

export function saveLoginReturn(bookId: string): void {
  sessionStorage.setItem(LOGIN_RETURN_KEY, bookId);
}

export function takeLoginReturn(): string | null {
  const bookId = sessionStorage.getItem(LOGIN_RETURN_KEY);
  sessionStorage.removeItem(LOGIN_RETURN_KEY);
  return bookId;
}
