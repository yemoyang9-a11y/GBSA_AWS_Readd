import { vectorSearch } from '../vector-search';
import * as repo from '../repository';
import { embedQuery } from '../../llm-gateway/embedding';

jest.mock('../repository', () => ({
  findAliases: jest.fn(),
  lexicalSearch: jest.fn(),
  vectorSearch: jest.fn(),
}));
jest.mock('../../llm-gateway/embedding', () => ({
  embedQuery: jest.fn(),
  EMBEDDING_DIM: 1024,
  EMBEDDING_MODEL: 'test',
}));

describe('grounded retrieval recovery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    (repo.findAliases as jest.Mock).mockResolvedValue([
      { alias: '[주사]+', characterName: '미래의 정체' },
    ]);
    (repo.vectorSearch as jest.Mock).mockResolvedValue([]);
    (repo.lexicalSearch as jest.Mock).mockResolvedValue([]);
    (embedQuery as jest.Mock).mockResolvedValue([0.1]);
  });
  afterEach(() => jest.restoreAllMocks());

  test('keeps regex-like aliases literal and never substitutes an unproven identity', async () => {
    await vectorSearch('book', '[주사]+ 누구야?', 40);
    expect(embedQuery).toHaveBeenCalledWith('[주사]+ 누구야?');
    expect(repo.findAliases).not.toHaveBeenCalled();
  });

  test('recovers lexical source evidence at K when embedding is unavailable', async () => {
    const source = [{ page_no: 40, content: '정주사는 고무신 장사를 했다.', distance: 1 }];
    (repo.lexicalSearch as jest.Mock).mockResolvedValue(source);
    (embedQuery as jest.Mock).mockRejectedValue(new Error('embedding unavailable'));
    await expect(vectorSearch('book', '정주사', 40)).resolves.toEqual(source);
    expect(repo.lexicalSearch).toHaveBeenCalledWith('book', '정주사', 40, 6);
    expect(repo.vectorSearch).not.toHaveBeenCalled();
  });

  test('recovers lexical evidence when vector retrieval finds nothing', async () => {
    const source = [{ page_no: 40, content: '정주사', distance: 1 }];
    (repo.lexicalSearch as jest.Mock).mockResolvedValue(source);
    await expect(vectorSearch('book', '정주사', 40)).resolves.toEqual(source);
  });

  test('uses prior wording only as a lexical hint while embedding the original follow-up', async () => {
    await vectorSearch('book', '그 사람 본명은?', 40, '전봇대는 누구야?');
    expect(embedQuery).toHaveBeenCalledWith('그 사람 본명은?');
    expect(repo.lexicalSearch).toHaveBeenCalledWith(
      'book',
      '그 사람 본명은?\n전봇대는 누구야?',
      40,
      6
    );
  });

  test('does not turn lexical database failure into missing evidence', async () => {
    (repo.lexicalSearch as jest.Mock).mockRejectedValue(new Error('database unavailable'));
    await expect(vectorSearch('book', '정주사', 40)).rejects.toThrow('database unavailable');
  });

  test('does not turn vector database failure into an embedding fallback', async () => {
    (repo.lexicalSearch as jest.Mock).mockResolvedValue([]);
    (repo.vectorSearch as jest.Mock).mockRejectedValue(new Error('vector database unavailable'));
    await expect(vectorSearch('book', '정주사', 40)).rejects.toThrow('vector database unavailable');
  });

  test('lexical recovery does not crowd every semantic match out of the six-page evidence budget', async () => {
    (repo.lexicalSearch as jest.Mock).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        page_no: i + 1,
        content: '일반적인 단어 일치',
        distance: 1,
      }))
    );
    (repo.vectorSearch as jest.Mock).mockResolvedValue([
      { page_no: 39, content: '질문에 대한 의미상 근거', distance: 0.1 },
    ]);
    const result = await vectorSearch('book', '그 사람 본명', 40);
    expect(result).toHaveLength(6);
    expect(result.some((page) => page.page_no === 39)).toBe(true);
  });

  test('excludes results beyond K while keeping the positive boundary', async () => {
    (repo.lexicalSearch as jest.Mock).mockResolvedValue([
      { page_no: 40, content: '현재', distance: 1 },
      { page_no: 41, content: '미래', distance: 1 },
    ]);
    (repo.vectorSearch as jest.Mock).mockResolvedValue([
      { page_no: 39, content: '이전', distance: 0.1 },
      { page_no: 42, content: '미래 정체', distance: 0.1 },
    ]);
    const result = await vectorSearch('book', '현재', 40);
    expect(result.map((r) => r.page_no)).toEqual([40, 39]);
  });
});
