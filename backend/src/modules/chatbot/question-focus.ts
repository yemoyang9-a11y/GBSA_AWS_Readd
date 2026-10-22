export type QuestionFocus =
  | { kind: 'identify_person'; requested: Array<'identity' | 'name'> }
  | { kind: 'verify_alias'; candidate_text: string; subject_text: string };

function unquote(text: string): string {
  const value = text.trim();
  const pairs: Record<string, string> = { '‘': '’', '“': '”', '"': '"', "'": "'" };
  return pairs[value[0]] === value.at(-1) ? value.slice(1, -1).trim() : value;
}

/** Preserve the proposition being asked; this classifies wording, never story facts. */
export function questionFocus(query: string): QuestionFocus | null {
  const text = query
    .trim()
    .replace(/[?？!！.。]+$/u, '')
    .trim();
  // The greedy candidate retains a full clause (including its internal particles).
  // A separate subject and explicit yes/no ending avoid treating origin/open questions as claims.
  const alias = text.match(
    /^(.+)(?:도|[은는이가])\s+(.+?)의\s*(?:별명|별칭)(?:이야|인가요|인가|이에요|예요|이니|이냐|일까|이지|(?:이\s*)?맞아|(?:이\s*)?맞나요)$/u
  );
  if (alias) {
    return {
      kind: 'verify_alias',
      candidate_text: unquote(alias[1]),
      subject_text: unquote(alias[2]),
    };
  }

  const identity =
    /(?:누구|어떤\s*(?:사람|인물)|무슨\s*(?:사람|인물)|직업|역할|하는\s*일|무슨\s*일을)/u.test(
      text
    );
  const name =
    /(?:본명|실명|성명|진짜\s*이름|이름(?:은|이|을|과|도)?\s*(?:뭐|무엇|어떻게|알려|알아))/u.test(
      text
    );
  const requested: Array<'identity' | 'name'> = [];
  if (identity) requested.push('identity');
  if (name) requested.push('name');
  return requested.length ? { kind: 'identify_person', requested } : null;
}
