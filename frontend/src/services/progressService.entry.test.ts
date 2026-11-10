import { enterBook } from './progressService';
import { api } from './api';
import { nextSeq, resetSeq } from '../utils/seq';
import type { EntryResponse } from '../types';

vi.mock('./api', () => ({ api: { post: vi.fn() } }));
vi.mock('../utils/constants', () => ({ USE_MOCK: false }));

it('does not reset the active book sequence when an earlier book entry finishes late', async () => {
  resetSeq();
  let releaseOld!: (response: { data: EntryResponse }) => void;
  const entry: EntryResponse = {
    route: 'reader',
    page: 90,
    is_new_session: false,
    session_epoch: 1,
  };
  vi.mocked(api.post)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseOld = resolve;
        })
    )
    .mockResolvedValueOnce({ data: entry });
  const old = enterBook('old');
  await enterBook('current');
  expect(nextSeq()).toBe(1);
  releaseOld({ data: entry });
  await old;
  expect(nextSeq()).toBe(2);
});
