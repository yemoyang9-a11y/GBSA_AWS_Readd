import { fetchPosition } from './positionService';
import { api } from './api';
import { mockPositions } from '../../mocks/fixtures';
import { mockRecordProgress } from '../../mocks/server';

const flags = vi.hoisted(() => ({ useMock: false }));

vi.mock('./api', () => ({ api: { get: vi.fn() } }));
vi.mock('../utils/constants', async (original) => ({
  ...(await original<typeof import('../utils/constants')>()),
  get USE_MOCK() {
    return flags.useMock;
  },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  flags.useMock = false;
  mockRecordProgress(21);
});

it('fetches the position without sending a page or cutoff', async () => {
  const position = {
    applied_cutoff: 40,
    current_chapter_no: 2,
    read_chapter_nos: [1, 2],
    is_complete: false,
  };
  vi.mocked(api.get).mockResolvedValue({ data: position });

  await expect(fetchPosition('book')).resolves.toEqual(position);
  expect(api.get).toHaveBeenCalledWith('/books/book/position');
});

it('FR-SPL-002: USE_MOCK=false면 책 id만 담은 요청을 한 번 보낸다', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: mockPositions['done-book'] });

  await fetchPosition('takryu');

  expect(api.get).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.get).mock.calls[0]).toEqual(['/books/takryu/position']);
});

it('FR-SPL-002: USE_MOCK=true면 네트워크 요청 없이 fixture 응답을 준다', async () => {
  flags.useMock = true;

  await expect(fetchPosition('takryu')).resolves.toEqual({
    applied_cutoff: 21,
    current_chapter_no: 3,
    read_chapter_nos: [1, 2],
    is_complete: false,
  });
  await expect(fetchPosition('done-book')).resolves.toEqual(mockPositions['done-book']);
  expect(api.get).not.toHaveBeenCalled();
});

it('FR-ADM-005: USE_MOCK=true에서 준비되지 않은 책은 403, 없는 책은 404로 실패한다', async () => {
  flags.useMock = true;

  await expect(fetchPosition('not-ready-book')).rejects.toMatchObject({ response: { status: 403 } });
  await expect(fetchPosition('no-such-book')).rejects.toMatchObject({ response: { status: 404 } });
  expect(api.get).not.toHaveBeenCalled();
});

it('FR-SPL-002: USE_MOCK=true에서 진도를 뒤로 옮기면 위치 응답의 세 값이 그 진도를 따른다', async () => {
  flags.useMock = true;

  mockRecordProgress(5);

  const position = await fetchPosition('takryu');
  expect(position.applied_cutoff).toBe(5);
  expect(position.current_chapter_no).toBe(1);
  expect(position.read_chapter_nos).toEqual([]);
  expect(position.is_complete).toBe(false);
});

it('FR-SPL-002: USE_MOCK=true에서 진도를 앞으로 옮기면 위치 응답의 세 값이 그 진도를 따른다', async () => {
  flags.useMock = true;

  mockRecordProgress(5);
  mockRecordProgress(30);

  const position = await fetchPosition('takryu');
  expect(position.applied_cutoff).toBe(30);
  expect(position.current_chapter_no).toBe(3);
  expect(position.read_chapter_nos).toEqual([1, 2, 3]);
  expect(position.is_complete).toBe(true);
});

it('FR-SPL-002: USE_MOCK=true에서 장의 마지막 쪽이면 그 장은 읽음이면서 현재 장이다', async () => {
  flags.useMock = true;

  mockRecordProgress(20);

  await expect(fetchPosition('takryu')).resolves.toEqual({
    applied_cutoff: 20,
    current_chapter_no: 2,
    read_chapter_nos: [1, 2],
    is_complete: false,
  });
});
