import { handleQuery } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { stream, call } from '../../llm-gateway/gateway';

jest.mock('../repository');
jest.mock('../vector-search', () => ({ vectorSearch: jest.fn() }));
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn(), call: jest.fn() }));

// These tests measure query framing and evidence delivery, not live model answer quality.
// The exact two production answers need a separate provider-backed semantic check.
describe('question focus reaches the single generation without becoming factual evidence', () => {
  let prompt: string;
  let system: string;
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    (repo.getBookMeta as jest.Mock).mockResolvedValue({ title: 'fixture', author: 'author' });
    (repo.getCurrentChapterText as jest.Mock).mockResolvedValue(null);
    for (const fn of [
      repo.findChapterSummaries,
      repo.findCharacters,
      repo.findRelationships,
      repo.findCharacterNotes,
      repo.findTerms,
      repo.findEvents,
    ]) {
      (fn as jest.Mock).mockResolvedValue([]);
    }
    (vectorSearch as jest.Mock).mockResolvedValue([]);
    (stream as jest.Mock).mockImplementation(async function* (_task, input, options) {
      prompt = input;
      system = options.system;
      yield '첫 출력';
      yield '과 뒷부분';
    });
  });
  afterEach(() => jest.restoreAllMocks());

  async function ask(
    query: string,
    page = { pageNo: 232, content: '여자가 공손히 마중을 한다. 식모도 이렇게 미리 구해 놓았고.' }
  ) {
    const iterator = handleQuery(
      'fixture',
      query,
      page.pageNo,
      'device',
      undefined,
      undefined,
      page
    );
    expect(await iterator.next()).toEqual({ value: '첫 출력', done: false });
    expect(await iterator.next()).toEqual({ value: '과 뒷부분', done: false });
    await iterator.next();
    expect(stream).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
    expect(prompt).toContain(page.content);
    expect(prompt).toContain(query);
    const focusLine = prompt.split('\n').find((line) => line.startsWith('{"kind":'));
    return focusLine ? JSON.parse(focusLine) : null;
  }

  test.each([
    ['초봉이가 새집에 들어왔을 때 맞아 준 여자는 누구야?', ['identity']],
    ['그 여자의 본명은 뭐야?', ['name']],
    ['그 여자는 누구고 본명도 알아?', ['identity', 'name']],
    ['그 여자의 본명과 하는 일은 뭐야?', ['identity', 'name']],
  ])('does not collapse the requested identification scope: %s', async (query, requested) => {
    expect(await ask(query as string)).toEqual({ kind: 'identify_person', requested });
  });

  test.each([
    ['키가 대중없이 길다도 전봇대의 별명이야?', '키가 대중없이 길다', '전봇대'],
    ['‘작은 별’도 민수의 별명이야?', '작은 별', '민수'],
    ['태수의 친구라는 말도 형보의 별명이야?', '태수의 친구라는 말', '형보'],
  ])(
    'preserves the exact proposed alias instead of answering a nearby name question: %s',
    async (query, candidate, subject) => {
      expect(
        await ask(query, { pageNo: 303, content: '고개를 한참 쳐들어야 얼굴이 보이는 전봇대다.' })
      ).toEqual({
        kind: 'verify_alias',
        candidate_text: candidate,
        subject_text: subject,
      });
      expect(system).not.toContain(candidate);
      expect(system).not.toContain(subject);
    }
  );

  test.each(['전봇대라는 별명이 왜 붙었어?', '전봇대의 별명은 뭐야?'])(
    'does not turn an open question into an alias assertion: %s',
    async (query) => {
      expect(await ask(query)).toBeNull();
    }
  );
});
