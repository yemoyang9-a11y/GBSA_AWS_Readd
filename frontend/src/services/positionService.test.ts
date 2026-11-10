import { fetchPosition } from './positionService';
import { api } from './api';

vi.mock('./api', () => ({ api: { get: vi.fn() } }));

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
