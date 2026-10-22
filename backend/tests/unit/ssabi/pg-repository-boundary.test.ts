import { createPgSsabiRepository, QueryClient } from '../../../src/modules/ssabi/pg-repository';

describe('FR-SPL-002: 관계와 별칭의 도서·인물 상한 SQL 계약', () => {
  const capture = (rows: unknown[] = []) => {
    const query = jest.fn().mockResolvedValue({ rows });
    return { query, repository: createPgSsabiRepository({ query } as QueryClient) };
  };

  it.each([0, 79, 80])(
    'K=%i: 관계 양 끝 인물도 같은 책의 읽은 범위에서 선택한다',
    async (cutoff) => {
      const { query, repository } = capture();
      await repository.findLatestRelationships('synthetic-book', cutoff);
      const [sql, parameters] = query.mock.calls[0];
      expect(parameters).toEqual(['synthetic-book', cutoff]);
      expect(sql).toMatch(/JOIN\s+characters\s+ca\b/i);
      expect(sql).toMatch(/JOIN\s+characters\s+cb\b/i);
      expect(sql).toMatch(/ca\.id\s*=\s*r\.character_a_id/i);
      expect(sql).toMatch(/cb\.id\s*=\s*r\.character_b_id/i);
      expect(sql).toMatch(/ca\.book_id\s*=\s*\$1/i);
      expect(sql).toMatch(/cb\.book_id\s*=\s*\$1/i);
      expect(sql).toMatch(/ca\.first_appearance_page\s*<=\s*\$2/i);
      expect(sql).toMatch(/cb\.first_appearance_page\s*<=\s*\$2/i);
      expect(sql).toMatch(/r\.established_page\s*<=\s*\$2/i);
    }
  );

  it('FR-CHR-001: 허용된 관계 라벨과 페이지를 변경하지 않고 반환한다', async () => {
    const row = {
      id: 'rel',
      book_id: 'synthetic-book',
      character_a_id: 'a',
      character_b_id: 'b',
      label: '동료',
      established_page: 80,
    };
    const { repository } = capture([row]);
    expect(await repository.findLatestRelationships('synthetic-book', 80)).toEqual([row]);
  });

  it('FR-SPL-002: 별칭 자체의 도서와 대상 인물의 도서·등장 시점을 모두 제한한다', async () => {
    const { query, repository } = capture();
    await repository.findAliases('synthetic-book', 79);
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual(['synthetic-book', 79]);
    expect(sql).toMatch(/a\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/c\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/c\.first_appearance_page\s*<=\s*\$2/i);
    expect(sql).toMatch(/a\.first_appearance_page\s*<=\s*\$2/i);
  });

  it('FR-SPL-002: 노트 자체의 도서도 대상 인물과 같아야 한다', async () => {
    const { query, repository } = capture();
    await repository.findCharacterNotes('synthetic-book', 79);
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual(['synthetic-book', 79]);
    expect(sql).toMatch(/cn\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/c\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/cn\.source_page\s*<=\s*\$2/i);
    expect(sql).toMatch(/c\.first_appearance_page\s*<=\s*\$2/i);
  });
});
