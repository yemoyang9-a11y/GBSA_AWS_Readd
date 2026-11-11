import { fetchPosition } from './positionService';
import { api } from './api';
import { mockPositions } from '../../mocks/fixtures';

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
  vi.mocked(api.get).mockResolvedValue({ data: mockPositions.takryu });

  await fetchPosition('takryu');

  expect(api.get).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.get).mock.calls[0]).toEqual(['/books/takryu/position']);
});

it('FR-SPL-002: USE_MOCK=true면 네트워크 요청 없이 fixture 응답을 준다', async () => {
  flags.useMock = true;

  await expect(fetchPosition('takryu')).resolves.toEqual(mockPositions.takryu);
  await expect(fetchPosition('done-book')).resolves.toEqual(mockPositions['done-book']);
  expect(api.get).not.toHaveBeenCalled();
});

it('FR-ADM-005: USE_MOCK=true에서 준비되지 않은 책은 403, 없는 책은 404로 실패한다', async () => {
  flags.useMock = true;

  await expect(fetchPosition('not-ready-book')).rejects.toMatchObject({ response: { status: 403 } });
  await expect(fetchPosition('no-such-book')).rejects.toMatchObject({ response: { status: 404 } });
  expect(api.get).not.toHaveBeenCalled();
});
