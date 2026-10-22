import { resolveConversationContext } from '../conversation-context';

type Turn = { role: 'user' | 'assistant'; text: string };
const catalog = [
  { id: 'pole', name: '전봇대', first_appearance_page: 303 },
  { id: 'doctor', name: '윤달식', first_appearance_page: 50 },
  { id: 'other', name: '명님이', first_appearance_page: 92 },
  { id: 'a', name: '민수', first_appearance_page: 2 },
  { id: 'b', name: '정호', first_appearance_page: 3 },
  { id: 'short', name: '이', first_appearance_page: 1 },
];
const user = (text: string): Turn => ({ role: 'user', text });
const assistant = (text: string): Turn => ({ role: 'assistant', text });
const resolve = (query: string, turns: Turn[] = [], K = 411) =>
  resolveConversationContext(query, turns, catalog, K);
const withQuote = (query: string, quote: string) =>
  `${query}\n\n선택한 문장: ${JSON.stringify(quote)}`;

describe('cutoff-safe user topic resolution without another model', () => {
  test('keeps the user topic for the production bare-name follow-up despite a wrong assistant name', () => {
    const result = resolve('본명은 뭐야', [user('전봇대는 누구야?'), assistant('오달식이에요.')]);
    expect(result).toMatchObject({
      status: 'followup',
      subjects: ['전봇대'],
      retrievalHint: '전봇대',
    });
    expect(result.history).toEqual([
      { role: 'user', content: '전봇대는 누구야?' },
      { role: 'assistant', content: '오달식이에요.' },
    ]);
  });

  test('keeps the latest explicitly named user subject for the production appearance-page follow-up', () => {
    expect(
      resolve('몇 페이지에 등장해', [
        user('전봇대는 누구야?'),
        assistant('전봇대 설명'),
        user('윤달식은 누구야?'),
        assistant('명님이는 92쪽에 나와요.'),
      ])
    ).toMatchObject({ status: 'followup', subjects: ['윤달식'], retrievalHint: '윤달식' });
  });

  test.each([
    '그 사람은 누구야?',
    '아까 말한 사람의 본명은?',
    '언제 처음 등장해?',
    '첫 등장 페이지는?',
    '이름은 뭐야?',
  ])('resolves an elliptical person question: %s', (query) => {
    expect(resolve(query, [user('민수는 누구야?')])).toMatchObject({
      status: 'followup',
      subjects: ['민수'],
    });
  });

  test('lets the current explicit subject replace prior topics', () => {
    expect(resolve('그럼 윤달식의 본명은?', [user('전봇대는 누구야?')])).toMatchObject({
      status: 'explicit',
      subjects: ['윤달식'],
    });
  });

  test.each([
    '몇 페이지에 처음 나와?',
    '몇 페이지에 나와?',
    '몇 쪽에서 나왔어?',
    '처음 나온 건 몇 페이지야?',
    '지금 그 사람은 몇 페이지에 등장해?',
  ])('retains the subject for natural appearance wording: %s', (query) => {
    expect(resolve(query, [user('윤달식은 누구야?')])).toMatchObject({
      status: 'followup',
      subjects: ['윤달식'],
    });
  });

  test('retains the earlier explicit anchor across repeated elliptical turns', () => {
    const turns: Turn[] = [user('전봇대는 누구야?'), assistant('설명')];
    for (let i = 0; i < 10; i++) turns.push(user('본명은?'), assistant('확인하지 못했어요.'));
    const result = resolve('몇 페이지에 등장해?', turns);
    expect(result).toMatchObject({ status: 'followup', subjects: ['전봇대'] });
    expect(result.history).toHaveLength(12);
    expect(result.history[0].role).toBe('user');
    expect(result.history.some((turn) => turn.content.includes('전봇대'))).toBe(false);
  });

  test('preserves a pair for plural and relationship follow-ups', () => {
    const turns = [user('민수와 정호는 어떤 관계야?')];
    for (const query of [
      '둘 다 몇 페이지에 등장해?',
      '그들의 본명은?',
      '서로 어떤 사이야?',
      '둘 중 누가 더 키가 커?',
    ]) {
      expect(resolve(query, turns)).toMatchObject({
        status: 'followup',
        subjects: ['민수', '정호'],
      });
    }
  });

  test('marks a singular follow-up to a pair ambiguous without selecting the last name', () => {
    expect(resolve('그 사람 본명은?', [user('민수와 정호는 어떤 관계야?')])).toMatchObject({
      status: 'ambiguous',
      subjects: ['민수', '정호'],
    });
  });

  test('does not use the proposed alias as the target person or a later topic', () => {
    const question = '민수도 정호의 별명이야?';
    expect(resolve(question)).toMatchObject({ status: 'explicit', subjects: ['정호'] });
    expect(resolve('본명은?', [user(question), assistant('네, 민수예요.')])).toMatchObject({
      status: 'followup',
      subjects: ['정호'],
    });
  });

  test('uses a newly selected quoted topic for an elliptical question and preserves it for the next turn', () => {
    const turns = [user('윤달식은 누구야?'), assistant('의사예요.')];
    const next = withQuote('본명은 뭐야?', '전봇대가 정거장 앞에 서 있었다.');
    expect(resolve(next, turns)).toMatchObject({ subjects: ['전봇대'], retrievalHint: '전봇대' });
    expect(
      resolve('몇 페이지에 처음 나와?', [...turns, user(next), assistant('오달식이에요.')])
    ).toMatchObject({ status: 'followup', subjects: ['전봇대'] });
  });

  test('lets an explicit current question outrank unrelated names in the selected quotation', () => {
    expect(
      resolve(withQuote('윤달식의 본명은?', '전봇대와 명님이가 서 있었다.'), [
        user('민수는 누구야?'),
      ])
    ).toMatchObject({ status: 'explicit', subjects: ['윤달식'] });
  });

  test('does not pick one person from a quotation containing a pair', () => {
    const quote = '민수와 정호가 만났다.';
    expect(resolve(withQuote('본명은?', quote), [user('윤달식은 누구야?')])).toMatchObject({
      status: 'ambiguous',
      subjects: ['민수', '정호'],
    });
    expect(resolve(withQuote('둘 다 본명은?', quote))).toMatchObject({
      subjects: ['민수', '정호'],
    });
  });

  test('lets a new quotation with no reliable named referent unlock the old topic', () => {
    const next = withQuote('본명은?', '낯선 여자가 마중을 나왔다.');
    const turns = [user('윤달식은 누구야?')];
    expect(resolve(next, turns)).toMatchObject({ status: 'none', subjects: [] });
    expect(resolve('몇 페이지에 등장해?', [...turns, user(next)])).toMatchObject({
      status: 'unresolved',
      subjects: [],
    });
  });

  test('does not turn a named scene companion inside a quote into the described question target', () => {
    expect(
      resolve(
        withQuote(
          '민수가 새집에 들어왔을 때 맞아 준 여자는 누구야?',
          '민수가 도착하니 여자가 마중을 나왔다.'
        ),
        [user('윤달식은 누구야?')]
      )
    ).toMatchObject({ status: 'none', subjects: [] });
  });

  test('preserves a user-provided label outside the catalog without canonical alias substitution', () => {
    expect(resolve('키다리는 누구야?', [user('전봇대는 누구야?')])).toMatchObject({
      status: 'explicit',
      subjects: ['키다리'],
      retrievalHint: '키다리',
    });
    expect(resolve('본명은?', [user('키다리는 누구야?'), assistant('전봇대예요.')])).toMatchObject({
      status: 'followup',
      subjects: ['키다리'],
      retrievalHint: '키다리',
    });
  });

  test('preserves a quoted multiword user label as wording only', () => {
    expect(resolve('‘작은 별’의 본명은?', [user('민수는 누구야?')])).toMatchObject({
      status: 'explicit',
      subjects: ['작은 별'],
    });
  });

  test('does not drop an unfamiliar second person from an explicit pair', () => {
    expect(resolve('민수와 키다리는 누구야?')).toMatchObject({
      status: 'explicit',
      subjects: ['민수', '키다리'],
    });
  });

  test('does not force an old topic onto an unresolvable new scene description', () => {
    const turns = [user('민수는 누구야?'), user('새집에서 맞아 준 여자는 누구야?')];
    expect(resolve('새집에서 맞아 준 여자는 누구야?', turns.slice(0, 1))).toMatchObject({
      status: 'none',
      subjects: [],
      retrievalHint: '',
    });
    expect(resolve('본명은 뭐야?', turns)).toMatchObject({ status: 'unresolved', subjects: [] });
  });

  test('does not replace a described scene participant with another named character in that scene', () => {
    const characters = [...catalog, { id: 'scene', name: '초봉이', first_appearance_page: 4 }];
    expect(
      resolveConversationContext(
        '초봉이가 새집에 들어왔을 때 맞아 준 여자는 누구야?',
        [user('민수는 누구야?')],
        characters,
        232
      )
    ).toMatchObject({ status: 'none', subjects: [], retrievalHint: '' });
  });

  test('does not invent a topic in a new conversation or from assistant-only turns', () => {
    expect(resolve('본명은 뭐야')).toMatchObject({ status: 'unresolved', subjects: [] });
    expect(resolve('본명은 뭐야', [assistant('민수예요.')])).toMatchObject({
      status: 'unresolved',
      subjects: [],
      history: [],
    });
  });

  test('does not carry a person topic into an independent current-position question', () => {
    expect(resolve('지금 몇 페이지야?', [user('민수는 누구야?')])).toMatchObject({
      status: 'none',
      subjects: [],
      retrievalHint: '',
    });
  });

  test('clears an old person anchor after an explicit independent chapter-summary topic', () => {
    expect(
      resolve('그 사람은 누구야?', [
        user('전봇대는 누구야?'),
        assistant('설명'),
        user('이번 장의 사건을 요약해 줘'),
        assistant('초봉이의 새집 장면이에요.'),
      ])
    ).toMatchObject({ status: 'unresolved', subjects: [] });
    expect(resolve('본명은?', [user('전봇대는 누구야?'), user('쉽게 요약해 줘')])).toMatchObject({
      status: 'followup',
      subjects: ['전봇대'],
    });
  });

  test('does not make an ordinary word or a longer name into a substring entity', () => {
    expect(resolve('이 이야기를 요약해 줘')).toMatchObject({ status: 'none', subjects: [] });
    expect(resolve('민수기라는 단어 뜻이 뭐야?')).toMatchObject({ status: 'none', subjects: [] });
    expect(resolve('명님이는 누구야?')).toMatchObject({ status: 'explicit', subjects: ['명님이'] });
  });

  test('accepts a valid Latin initial name but not its occurrence inside another token', () => {
    const characters = [{ id: 's', name: 'S', first_appearance_page: 4 }];
    expect(resolveConversationContext('S는 누구야?', [], characters, 4)).toMatchObject({
      status: 'explicit',
      subjects: ['S'],
    });
    expect(resolveConversationContext('SAMPLE 뜻이 뭐야?', [], characters, 4)).toMatchObject({
      status: 'none',
      subjects: [],
    });
  });

  test('FR-SPL-002: catalog rows above K do not participate in resolution or history', () => {
    const hidden = [{ id: 'future', name: '낯선인물', first_appearance_page: 100 }];
    const safe = [{ id: 'safe', name: '민수', first_appearance_page: 2 }];
    const a = resolveConversationContext('그 사람 본명은?', [user('민수는 누구야?')], safe, 30);
    const b = resolveConversationContext(
      '그 사람 본명은?',
      [user('민수는 누구야?')],
      [...safe, ...hidden],
      30
    );
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).not.toContain('낯선인물');
    expect(resolveConversationContext('낯선인물은 누구야?', [], hidden, 30).subjects).toEqual([
      '낯선인물',
    ]);
    expect(resolveConversationContext('낯선인물은 누구야?', [], hidden, 100).subjects).toEqual([
      '낯선인물',
    ]);
  });

  test('supports an explicit correction instead of keeping the rejected name', () => {
    expect(resolve('윤달식이 아니라 전봇대 말이야', [user('윤달식은 누구야?')])).toMatchObject({
      status: 'explicit',
      subjects: ['전봇대'],
    });
  });

  test('bounds native history by whole exchanges without changing the input turns', () => {
    const turns = [
      user('민수는 누구야?'),
      assistant('가'.repeat(3500)),
      user('본명은?'),
      assistant('나'.repeat(3500)),
    ];
    const original = JSON.stringify(turns);
    const result = resolve('몇 페이지에 등장해?', turns);
    expect(result.subjects).toEqual(['민수']);
    expect(result.history).toEqual([
      { role: 'user', content: '본명은?' },
      { role: 'assistant', content: '나'.repeat(3500) },
    ]);
    expect(result.history.reduce((sum, turn) => sum + turn.content.length, 0)).toBeLessThanOrEqual(
      6000
    );
    expect(JSON.stringify(turns)).toBe(original);
  });
});
