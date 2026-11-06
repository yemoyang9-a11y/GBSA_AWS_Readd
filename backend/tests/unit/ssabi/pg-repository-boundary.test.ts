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
    expect(parameters).toEqual(['synthetic-book', 79, expect.any(Array)]);
    expect(sql).toMatch(/a\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/c\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/c\.first_appearance_page\s*<=\s*\$2/i);
    expect(sql).toMatch(/a\.first_appearance_page\s*<=\s*\$2/i);
  });

  it('FR-CHR-001: 누구에게나 쓰는 호칭·친족어는 인물 별칭으로 내보내지 않는다', async () => {
    const { query, repository } = capture();
    await repository.findAliases('synthetic-book', 79);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toMatch(/a\.alias\s*<>\s*ALL\(\s*\$3::text\[\]\s*\)/i);
    expect(parameters[2]).toEqual(
      expect.arrayContaining(['아낙', '아주머니', '딸', '새끼', '어린애', '동생', '아내', '그'])
    );
    expect(parameters[2]).not.toEqual(expect.arrayContaining(['약제사']));
  });

  it('FR-CHR-001: 집안을 가리키는 "○○네", 이름과 같은 별칭, 이름에 부르는 조사가 붙은 꼴은 내보내지 않는다', async () => {
    const { query, repository } = capture();
    await repository.findAliases('synthetic-book', 79);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/a\.alias\s+NOT\s+LIKE\s+'%네'/i);
    expect(sql).toMatch(
      /a\.alias\s+NOT\s+IN\s*\(\s*c\.name\s*,\s*c\.name\s*\|\|\s*'야'\s*,\s*c\.name\s*\|\|\s*'아'\s*\)/i
    );
  });

  it('FR-SPL-002: 별칭 반복 언급은 같은 책의 읽은 페이지 안에서만 센다', async () => {
    const { query, repository } = capture();
    await repository.findAliases('synthetic-book', 79);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/FROM\s+pages\s+p\b/i);
    expect(sql).toMatch(/p\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/p\.page_no\s+BETWEEN\s+a\.first_appearance_page\s+AND\s+\$2/i);
    expect(sql).toMatch(/strpos\(\s*p\.content\s*,\s*a\.alias\s*\)/i);
    expect(sql).toMatch(/>=\s*2/);
  });

  it('FR-SPL-002: "○○의 △△" 설명형 별칭은 읽은 범위에 등장한 인물을 가리킬 때만 언급 수와 무관하게 낸다', async () => {
    const { query, repository } = capture();
    await repository.findAliases('synthetic-book', 79);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/OR\s+EXISTS/i);
    expect(sql).toMatch(/r\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/r\.id\s*<>\s*a\.character_id/i);
    expect(sql).toMatch(/r\.first_appearance_page\s*<=\s*\$2/i);
    expect(sql).toMatch(/ra\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/ra\.first_appearance_page\s*<=\s*\$2/i);
    expect(sql).toMatch(
      /strpos\(\s*' '\s*\|\|\s*a\.alias\s*,\s*' '\s*\|\|\s*r\.name\s*\|\|\s*'의 '\s*\)/i
    );
    expect(sql).toMatch(
      /strpos\(\s*' '\s*\|\|\s*a\.alias\s*,\s*' '\s*\|\|\s*r\.name\s*\|\|\s*'네 '\s*\)/i
    );
    expect(sql).toMatch(
      /strpos\(\s*' '\s*\|\|\s*a\.alias\s*,\s*' '\s*\|\|\s*ra\.alias\s*\|\|\s*'의 '\s*\)/i
    );
    expect(sql).toMatch(
      /strpos\(\s*' '\s*\|\|\s*a\.alias\s*,\s*' '\s*\|\|\s*ra\.alias\s*\|\|\s*'네 '\s*\)/i
    );
    expect(sql).toMatch(/ra\.alias\s*<>\s*ALL\(\s*\$3::text\[\]\s*\)/i);
    expect(sql).toMatch(/r\.name\s*<>\s*ALL\(\s*\$3::text\[\]\s*\)/i);
  });

  it('FR-SPL-002: 여러 인물이 함께 쓰는 지칭 판정도 읽은 범위의 별칭·인물만 본다', async () => {
    const { query, repository } = capture();
    await repository.findAliases('synthetic-book', 79);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/NOT\s+EXISTS/i);
    expect(sql).toMatch(/o\.alias\s*=\s*a\.alias/i);
    expect(sql).toMatch(/o\.character_id\s*<>\s*a\.character_id/i);
    expect(sql).toMatch(/o\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/oc\.book_id\s*=\s*\$1/i);
    expect(sql).toMatch(/o\.first_appearance_page\s*<=\s*\$2/i);
    expect(sql).toMatch(/oc\.first_appearance_page\s*<=\s*\$2/i);
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
