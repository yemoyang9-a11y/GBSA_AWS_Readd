import { clearPendingJump, setPendingJump, takePendingJump } from './pendingJump';

beforeEach(() => {
  clearPendingJump();
});

test('FR-PRG-003: 예약한 책에서 꺼내면 쪽을 주고, 두 번째에는 null이다', () => {
  setPendingJump('takryu', 58);
  expect(takePendingJump('takryu')).toBe(58);
  expect(takePendingJump('takryu')).toBeNull();
});

test('FR-PRG-003: 다른 책에서 꺼내면 null이고 예약도 지워진다', () => {
  setPendingJump('takryu', 58);
  expect(takePendingJump('other-book')).toBeNull();
  expect(takePendingJump('takryu')).toBeNull();
});

test('clearPendingJump 뒤에는 null이다', () => {
  setPendingJump('takryu', 58);
  clearPendingJump();
  expect(takePendingJump('takryu')).toBeNull();
});

test('FR-PRG-003: 새로 예약하면 앞의 예약을 덮어쓴다', () => {
  setPendingJump('takryu', 11);
  setPendingJump('takryu', 21);
  expect(takePendingJump('takryu')).toBe(21);
});

test('FR-PRG-003: 예약은 localStorage와 sessionStorage에 아무것도 쓰지 않는다', () => {
  const localSet = vi.spyOn(window.localStorage.__proto__, 'setItem');
  const localLength = window.localStorage.length;
  const sessionLength = window.sessionStorage.length;

  setPendingJump('takryu', 58);
  takePendingJump('takryu');
  setPendingJump('takryu', 11);
  clearPendingJump();

  expect(localSet).not.toHaveBeenCalled();
  expect(window.localStorage.length).toBe(localLength);
  expect(window.sessionStorage.length).toBe(sessionLength);
  localSet.mockRestore();
});
