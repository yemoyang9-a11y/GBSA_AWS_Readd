import { handleQuery } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { getConversationContext, recordTurns } from '../conversation-service';
import { stream } from '../../llm-gateway/gateway';

jest.mock('../repository');
jest.mock('../vector-search');
jest.mock('../conversation-service', () => ({
  getConversationContext: jest.fn(),
  recordTurns: jest.fn(),
}));
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn() }));

describe('conversation subject survives retrieval and single streaming generation', () => {
  let prompt: string;
  let options: { system: string; history?: Array<{ role: string; content: string }> };
  const characters = [
    { id: 'doctor', book_id: 'book', name: '윤달식', first_appearance_page: 50 },
    { id: 'other', book_id: 'book', name: '명님이', first_appearance_page: 92 },
    { id: 'pole', book_id: 'book', name: '전봇대', first_appearance_page: 303 },
  ];
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    (repo.getBookMeta as jest.Mock).mockResolvedValue({ title: 'fixture', author: 'author' });
    (repo.getCurrentChapterText as jest.Mock).mockResolvedValue(null);
    for (const fn of [
      repo.findChapterSummaries,
      repo.findRelationships,
      repo.findCharacterNotes,
      repo.findTerms,
      repo.findEvents,
    ]) {
      (fn as jest.Mock).mockResolvedValue([]);
    }
    (repo.findCharacters as jest.Mock).mockResolvedValue(characters);
    (vectorSearch as jest.Mock).mockResolvedValue([]);
    (getConversationContext as jest.Mock).mockResolvedValue([]);
    (stream as jest.Mock).mockImplementation(async function* (_task, input, requestOptions) {
      prompt = input;
      options = requestOptions;
      yield '첫';
      yield ' 응답';
    });
  });
  afterEach(() => jest.restoreAllMocks());

  async function ask(query: string, id: number | null = 7, quote?: string) {
    const iterator = handleQuery('book', query, 304, 'device', id ?? undefined, quote, {
      pageNo: 304,
      content: '정주사가 전봇대와 대화한다.',
    });
    expect(await iterator.next()).toEqual({ value: '첫', done: false });
    expect(await iterator.next()).toEqual({ value: ' 응답', done: false });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
    expect(stream).toHaveBeenCalledTimes(1);
    const state = prompt.split('\n').find((line) => line.startsWith('{"status":'));
    return state ? JSON.parse(state) : null;
  }

  test('omitted real-name subject stays on the user topic despite an incorrect assistant name', async () => {
    const turns = [
      { role: 'user', text: '전봇대는 별칭이야?' },
      { role: 'assistant', text: '이전 오답: 오달식이라고 합니다.' },
    ];
    (getConversationContext as jest.Mock).mockResolvedValue(turns);
    const focus = await ask('본명은 뭐야?');
    expect(focus).toMatchObject({ status: 'followup', subjects: ['전봇대'] });
    expect(vectorSearch).toHaveBeenCalledWith('book', '본명은 뭐야?', 304, '전봇대');
    expect(options.history).toEqual([
      { role: 'user', content: '전봇대는 별칭이야?' },
      { role: 'assistant', content: '이전 오답: 오달식이라고 합니다.' },
    ]);
    expect(options.system).not.toContain('오달식');
    expect(prompt).not.toContain('이전 오답:');
    expect(recordTurns).toHaveBeenCalledWith(7, '본명은 뭐야?', '첫 응답', 304);
  });

  test('page follow-up keeps the doctor even when current-page evidence concerns someone else', async () => {
    (getConversationContext as jest.Mock).mockResolvedValue([
      { role: 'user', text: '윤달식은 누구야?' },
      { role: 'assistant', text: '금호의원 의사예요.' },
      { role: 'user', text: '무슨 일을 해?' },
      { role: 'assistant', text: '의사로 일해요.' },
    ]);
    const focus = await ask('몇 페이지에 등장해?');
    expect(focus).toMatchObject({ status: 'followup', subjects: ['윤달식'] });
    expect(vectorSearch).toHaveBeenCalledWith('book', '몇 페이지에 등장해?', 304, '윤달식');
    const facts = JSON.parse(
      prompt.split('\n').find((line) => line.startsWith('{"subject_facts":'))!
    );
    expect(facts.subject_facts).toEqual([{ name: '윤달식', first_appearance_page: 50 }]);
  });

  test('an explicit subject change overrides an old active topic', async () => {
    (getConversationContext as jest.Mock).mockResolvedValue([
      { role: 'user', text: '전봇대는 별칭이야?' },
      { role: 'assistant', text: '별명이에요.' },
    ]);
    expect(await ask('윤달식은 어떤 일을 해?')).toMatchObject({
      status: 'explicit',
      subjects: ['윤달식'],
    });
    // Explicit user wording already carries the subject; no old subject is appended.
    expect(vectorSearch).toHaveBeenCalledWith('book', '윤달식은 어떤 일을 해?', 304);
  });

  test('a fresh conversation cannot borrow an arbitrary character from the book as its subject', async () => {
    expect(await ask('본명은 뭐야?', null)).toMatchObject({ status: 'unresolved', subjects: [] });
    expect(options.history).toEqual([]);
    expect(getConversationContext).not.toHaveBeenCalled();
    expect(vectorSearch).toHaveBeenCalledWith('book', '본명은 뭐야?', 304);
  });

  test('a scene identifies an unnamed person without replacing her with a named bystander', async () => {
    (repo.findCharacters as jest.Mock).mockResolvedValue([
      ...characters,
      { id: 'cho', book_id: 'book', name: '초봉이', first_appearance_page: 6 },
    ]);
    (getConversationContext as jest.Mock).mockResolvedValue([
      { role: 'user', text: '윤달식은 누구야?' },
      { role: 'assistant', text: '의사예요.' },
    ]);
    const scene = '초봉이가 새집에 들어왔을 때 맞아 준 여자는 누구야?';
    const state = await ask(scene);
    expect(state).toMatchObject({ status: 'none', subjects: [] });
    expect(vectorSearch).toHaveBeenCalledWith('book', scene, 304);
  });

  test('a newly selected quote replaces the old subject for an elliptical question', async () => {
    (getConversationContext as jest.Mock).mockResolvedValue([
      { role: 'user', text: '윤달식은 누구야?' },
      { role: 'assistant', text: '금호의원 의사예요.' },
    ]);
    const state = await ask('본명은 뭐야?', 7, '전봇대');
    expect(state.subjects).toEqual(['전봇대']);
    expect(vectorSearch).toHaveBeenCalledWith('book', '본명은 뭐야?', 304, '전봇대');
    expect(recordTurns).toHaveBeenCalledWith(7, '본명은 뭐야?', '첫 응답', 304, '전봇대');
    expect(options.system).not.toContain('전봇대');
  });
});
