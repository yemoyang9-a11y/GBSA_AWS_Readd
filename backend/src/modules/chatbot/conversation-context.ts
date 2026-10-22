import { questionFocus } from './question-focus';
import { parseConversationInput } from './conversation-input';

type Turn = { role: 'user' | 'assistant'; text: string };
type Character = { id: string; name: string; first_appearance_page: number };
type HistoryTurn = { role: 'user' | 'assistant'; content: string };

export interface ConversationContext {
  status: 'explicit' | 'followup' | 'ambiguous' | 'unresolved' | 'none';
  subjects: string[];
  retrievalHint: string;
  history: HistoryTurn[];
}

const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_CHARS = 6000;
const ATTRIBUTE =
  '(?:누구|어떤\\s*(?:사람|인물|관계)|무슨\\s*(?:사람|인물|일)|본명|실명|성명|이름|별명|별칭|직업|역할|관계|사이|몇\\s*(?:페이지|쪽)|어느\\s*(?:페이지|쪽)|언제|어디|처음|첫\\s*등장|등장|나오|나와|나온|나왔|말이야|말이에요)';
const SUBJECT_SLOT = new RegExp(`^(.+?)(?:의|은|는|이|가)\\s*${ATTRIBUTE}`, 'u');
const BARE_SUBJECT_SLOT = new RegExp(`^(.+?)\\s+${ATTRIBUTE}`, 'u');
const GENERIC_SUBJECT =
  /^(?:본명|실명|성명|이름|별명|별칭|직업|역할|관계|사이|첫|처음|언제|어디서|몇|어느|어떤|첫등장(?:페이지|쪽)?|처음등장(?:페이지|쪽)?|등장(?:페이지|쪽)?|(?:몇|어느)(?:페이지|쪽)(?:에|에서)?|그|걔|얘|그녀|그들|둘|둘다|두사람|각자|각각|모두|서로(?:어떤)?|(?:(?:그|이|저|아까말한|방금말한|앞서말한|아까나온|방금나온)(?:사람|인물|분|여자|남자)))$/u;

function isGenericSubject(value: string): boolean {
  return GENERIC_SUBJECT.test(value.replace(/\s+/gu, '').replace(/^지금(?=그|이|저)/u, ''));
}

function unquote(text: string): { value: string; quoted: boolean } {
  const value = text.trim();
  const pairs: Record<string, string> = { '‘': '’', '“': '”', '"': '"', "'": "'" };
  const quoted = pairs[value[0]] === value.at(-1);
  return { value: quoted ? value.slice(1, -1).trim() : value, quoted };
}

/** A literal topic is user wording, never a claim that the label is a known identity. */
function literalSubjects(phrase: string): string[] {
  const whole = unquote(phrase);
  const parts = whole.quoted
    ? [phrase]
    : phrase.split(/(?:와|과|랑|하고)\s+|\s*(?:,|및|그리고)\s*/u);
  if (parts.length > 4) return [];
  const names: string[] = [];
  for (const part of parts) {
    const { value, quoted } = unquote(part);
    if (!value || value.length > 60 || isGenericSubject(value)) return [];
    if (!quoted && !/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(value)) return [];
    // Single Korean syllables are often grammatical words (이, 나, 그), not names.
    if (!quoted && /^[가-힣]$/u.test(value)) return [];
    names.push(value);
  }
  return [...new Set(names)];
}

function catalogMentions(text: string, names: string[]): string[] {
  const hits: Array<{ name: string; start: number; end: number }> = [];
  for (const name of names) {
    if (/^[가-힣]$/u.test(name)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = new RegExp(
      `(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_]|(?:에게서|에게|에서|으로|이랑|라는|이란|처럼|부터|까지|하고|은|는|이|가|의|을|를|와|과|도|랑|만|로)(?=$|[^\\p{L}\\p{N}_]))`,
      'gu'
    );
    for (const match of text.matchAll(boundary)) {
      const start = match.index! + match[1].length;
      hits.push({ name, start, end: start + name.length });
    }
  }
  // Prefer the whole literal name over any shorter overlapping catalog spelling.
  const selected: typeof hits = [];
  for (const hit of hits.sort((a, b) => b.name.length - a.name.length)) {
    if (!selected.some((other) => hit.start < other.end && other.start < hit.end))
      selected.push(hit);
  }
  return [...new Set(selected.sort((a, b) => a.start - b.start).map((hit) => hit.name))];
}

type Wording = {
  subjects: string[];
  followup: boolean;
  reset: boolean;
  plural: boolean;
  fromQuote?: boolean;
};

function inspectWording(query: string, names: string[]): Wording {
  let text = query
    .trim()
    .replace(/[?？!！.。]+$/u, '')
    .trim();
  text = text.replace(
    /^(?:(?:그럼|그러면|그런데|그리고|아니요|아니|근데|이제|아모야|싸비야|저기)[,\s]+)+/u,
    ''
  );
  // An explicitly corrected target supersedes the rejected wording.
  const correction = [...text.matchAll(/(?:이|가)?\s*(?:아니라|말고)\s+/gu)].at(-1);
  if (correction) text = text.slice(correction.index! + correction[0].length);
  const empty = { subjects: [], followup: false, reset: false, plural: false };
  if (
    /^(?:지금|현재|내가|나)\s*.*(?:몇\s*(?:페이지|쪽)|(?:페이지|위치).*어디)/u.test(text) &&
    !/(?:등장|나오|나와|나온|나왔)/u.test(text)
  )
    return empty;

  const focus = questionFocus(text);
  const plural = /(?:둘|두\s*(?:사람|인물|명)|각자|각각|모두|그들|서로|관계|사이)/u.test(text);
  if (focus?.kind === 'verify_alias') {
    const subjects = literalSubjects(focus.subject_text);
    return {
      subjects,
      followup: subjects.length === 0 && isGenericSubject(focus.subject_text),
      reset: subjects.length === 0 && !isGenericSubject(focus.subject_text),
      plural,
    };
  }

  const personFollowup =
    focus?.kind === 'identify_person' ||
    plural ||
    /(?:그\s*(?:사람|인물|분|여자|남자)|걔|얘|그의|그녀|그는|그들|본명|실명|성명|첫\s*등장|처음.*(?:등장|나오|나와|나온|나왔)|(?:몇|어느)\s*(?:페이지|쪽).*(?:등장|나오|나와|나온|나왔)|언제.*(?:등장|나오|나와|나온|나왔)|등장.*(?:페이지|쪽)|서로|관계|사이)/u.test(
      text
    );
  const slot = text.match(SUBJECT_SLOT) ?? text.match(BARE_SUBJECT_SLOT);
  if (slot && personFollowup) {
    const phrase = slot[1].trim();
    if (!isGenericSubject(phrase)) {
      const subjects = literalSubjects(phrase);
      // A described scene participant is not every named person inside the description.
      // Leave the current scene question intact, but prevent the previous topic resurfacing.
      return { subjects, followup: false, reset: subjects.length === 0, plural };
    }
  }

  const subjects = catalogMentions(text, names);
  if (subjects.length) return { subjects, followup: false, reset: false, plural };
  if (slot && /말이야|말이에요/u.test(text)) {
    const subjects = literalSubjects(slot[1]);
    return { subjects, followup: false, reset: subjects.length === 0, plural };
  }
  const independentTopic =
    /(?:(?:줄거리|사건|내용|(?:이번|현재|\d+)\s*장).*요약|요약.*(?:줄거리|사건|내용|\d+\s*장)|(?:단어|표현|용어).*뜻)/u.test(
      text
    );
  return {
    subjects: [],
    followup: personFollowup && !independentTopic,
    reset: independentTopic,
    plural,
  };
}

function inspectInput(text: string, names: string[]): Wording {
  const input = parseConversationInput(text);
  const wording = inspectWording(input.query, names);
  if (!input.quote?.trim() || wording.subjects.length) return wording;
  // A newly selected passage changes the reader's reference. It is still only user context;
  // matching a name here does not authenticate the quotation or establish any story fact.
  if (wording.reset || !wording.followup) return { ...wording, reset: true };
  const subjects = catalogMentions(input.quote, names);
  return subjects.length
    ? { ...wording, subjects, fromQuote: true }
    : { subjects: [], followup: false, reset: true, plural: wording.plural };
}

/** Preserve recent whole exchanges; an assistant-only prefix is not a conversation. */
function boundedHistory(turns: Turn[]): HistoryTurn[] {
  const exchanges: HistoryTurn[][] = [];
  for (const turn of turns) {
    if (turn.role === 'user') exchanges.push([]);
    exchanges.at(-1)?.push({ role: turn.role, content: turn.text });
  }
  const selected: HistoryTurn[][] = [];
  let count = 0;
  let chars = 0;
  for (let i = exchanges.length - 1; i >= 0; i--) {
    const exchange = exchanges[i];
    const length = exchange.reduce((sum, turn) => sum + turn.content.length, 0);
    if (count + exchange.length > MAX_HISTORY_TURNS || chars + length > MAX_HISTORY_CHARS) break;
    selected.unshift(exchange);
    count += exchange.length;
    chars += length;
  }
  return selected.flat();
}

/**
 * FR-SPL-002: callers supply already cutoff-filtered turns; catalog filtering is repeated here.
 * Subjects describe the user's requested topic, not facts, canonical identities, or model answers.
 * No model/API/DB call is needed, and a wrong assistant answer cannot become a topic anchor.
 */
export function resolveConversationContext(
  query: string,
  priorTurns: Turn[],
  characters: Character[],
  K: number
): ConversationContext {
  const names = [
    ...new Set(
      characters
        .filter(
          (character) =>
            character.first_appearance_page <= K && character.first_appearance_page >= 1
        )
        .map((character) => character.name)
    ),
  ];
  let anchor: string[] = [];
  // Resolve before limiting history, so a run of short follow-ups cannot erase its user anchor.
  for (const turn of priorTurns) {
    if (turn.role !== 'user') continue;
    const wording = inspectInput(turn.text, names);
    if (wording.subjects.length) anchor = wording.subjects;
    else if (wording.reset) anchor = [];
  }
  const current = inspectInput(query, names);
  const subjects = current.subjects.length ? current.subjects : current.followup ? anchor : [];
  const status: ConversationContext['status'] =
    current.subjects.length && !current.fromQuote
      ? 'explicit'
      : current.followup
        ? subjects.length === 0
          ? 'unresolved'
          : subjects.length > 1 && !current.plural
            ? 'ambiguous'
            : 'followup'
        : 'none';
  return {
    status,
    subjects,
    retrievalHint: subjects.join(' / '),
    history: boundedHistory(priorTurns),
  };
}
