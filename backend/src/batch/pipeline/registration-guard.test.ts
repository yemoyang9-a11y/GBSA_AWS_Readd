import * as grounding from './grounding';
import { Page } from '../../shared/types';

const api = grounding as unknown as {
  sealResolvedOutput: (data: Record<string, unknown>, pages: Page[]) => Record<string, unknown>;
  assertResolvedGrounding: (data: unknown, pages: Page[]) => void;
  assertInitialRegistration: (client: { query: jest.Mock }, bookId: string) => Promise<void>;
  assertStoredGrounding: (
    client: { query: jest.Mock },
    data: unknown,
    bookId: string
  ) => Promise<void>;
};
const pages: Page[] = [{ id: 'p', book_id: 'fixture', page_no: 1, content: '원문' }];

test('legacy, source-changed and hand-edited resolved artifacts cannot enter registration', () => {
  expect(typeof api.sealResolvedOutput).toBe('function');
  const data = { book_id: 'fixture', characters: [], review_candidates: [] };
  const sealed = api.sealResolvedOutput(data, pages);
  expect(() => api.assertResolvedGrounding(sealed, pages)).not.toThrow();
  expect(() => api.assertResolvedGrounding(data, pages)).toThrow(/grounding/i);
  expect(() =>
    api.assertResolvedGrounding({ ...sealed, characters: [{ name: '추가' }] }, pages)
  ).toThrow(/grounding/i);
  expect(() => api.assertResolvedGrounding(sealed, [{ ...pages[0], content: 'changed' }])).toThrow(
    /grounding/i
  );
});

test.each([
  { publish_status: 'published', has_generated_content: false },
  { publish_status: 'draft', has_generated_content: true },
])(
  'existing content or a published book requires a separate reviewed migration: %p',
  async (book) => {
    expect(typeof api.assertInitialRegistration).toBe('function');
    const client = { query: jest.fn().mockResolvedValue({ rows: [book] }) };
    await expect(api.assertInitialRegistration(client, 'fixture')).rejects.toThrow(/migration/i);
    expect(
      client.query.mock.calls
        .map(([sql]) => sql)
        .some((sql) => /^\s*(INSERT|UPDATE|DELETE)\b/.test(sql))
    ).toBe(false);
  }
);

test('an empty draft is eligible for initial registration', async () => {
  expect(typeof api.assertInitialRegistration).toBe('function');
  const client = {
    query: jest
      .fn()
      .mockResolvedValue({ rows: [{ publish_status: 'draft', has_generated_content: false }] }),
  };
  await expect(api.assertInitialRegistration(client, 'fixture')).resolves.toBeUndefined();
});

test('locks the book before checking generated content with a fresh statement snapshot', async () => {
  const client = {
    query: jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ publish_status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ has_generated_content: true }] }),
  };
  await expect(api.assertInitialRegistration(client, 'fixture')).rejects.toThrow(/migration/i);
  expect(client.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
  expect(client.query.mock.calls[0][0]).not.toMatch(/EXISTS/);
  expect(client.query.mock.calls[1][0]).toMatch(/EXISTS/);
});

test('stored pages from a different edition fail even with the same page count', async () => {
  expect(typeof api.assertStoredGrounding).toBe('function');
  const data = api.sealResolvedOutput({ book_id: 'fixture', characters: [] }, pages);
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [{ ...pages[0], content: 'different edition' }] }),
  };
  await expect(api.assertStoredGrounding(client, data, 'fixture')).rejects.toThrow(/Grounding/);
  client.query.mockResolvedValue({ rows: pages });
  await expect(api.assertStoredGrounding(client, data, 'fixture')).resolves.toBeUndefined();
});
