/** Conservative review triggers, not a natural-language truth checker. No candidate is rewritten. */
const compact = (text: string): string => text.normalize('NFKC').replace(/\s+/gu, '');
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A substring of a longer name or a conjugation is not an independently attested label. */
export function hasLabelMention(text: string, label: string): boolean {
  return labelMentions(text, label).length > 0;
}

export function labelMentions(text: string, label: string): { start: number; end: number }[] {
  if (!label.trim()) return [];
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escape(label.trim())}(?=$|[^\\p{L}\\p{N}]|(?:으로|에게|에서|부터|까지|처럼|한테|은|는|이|가|의|을|를|와|과|도|만|로|에|네|님|씨|께|라고|라|란|다|인))`,
    'gu'
  );
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index!,
    end: match.index! + match[0].length,
  }));
}

export function aliasReviewReason(
  name: string,
  alias: string,
  type: string,
  quote: string
): string | undefined {
  const value = alias.trim();
  if (!hasLabelMention(quote, value))
    return 'Alias is only a word/conjugation fragment, not a standalone reference';
  if (
    (/\s/u.test(value) && /(?:다|요|죠|냐|인가|흰가|[?!])$/u.test(value)) ||
    /(?:고\s*있는|[이을를]\s+.*(?:될|하는|한)\s)/u.test(value)
  )
    return 'Descriptive clause or utterance requires review, not an individual alias';
  if (/(?:내외|부부|남매|자매|형제|처자|식구|가족)(?:들)?$/u.test(value)) {
    return 'Collective reference cannot be attached to one individual';
  }
  if (type === 'kinship' && /(?:친구|동무|동료|이웃)/u.test(value)) {
    return 'Social relationship is not a family kinship title';
  }
  if (
    type !== 'title' &&
    /^(?:식모|의사|간호사|경부보|순사|주임|사무원|지배인|학생|기생)$/u.test(value)
  ) {
    return 'Explicit occupation/title requires title classification';
  }
  if (type === 'name') {
    const a = compact(value);
    const n = compact(name);
    // Only unambiguous spacing/width or surname omission is accepted automatically.
    // Dialect spellings and added descriptive titles stay reviewable instead of being guessed.
    const surnameVariant =
      Math.abs(a.length - n.length) === 1 &&
      Math.min(a.length, n.length) >= 2 &&
      (a.endsWith(n) || n.endsWith(a));
    if (a !== n && !surnameVariant)
      return 'Name variant contains an unverified inflection, description or spelling change';
  }
  return undefined;
}

/** Small, explicit equivalence classes; broad parent/child or gender-ambiguous labels are not collapsed. */
export function relationshipKey(label: string): string {
  const normalized = compact(label).replace(/(?:관계)$/u, '');
  const pair = normalized
    .split(/(?:\/|·|,|와|과|및|\s)/u)
    .filter(Boolean)
    .sort()
    .join('/');
  const groups: [string, string[]][] = [
    ['father-daughter', ['부녀', '아버지/딸', '딸/부친']],
    ['mother-daughter', ['모녀', '딸/어머니', '딸/모친']],
    ['sisters', ['자매', '동생/언니', '여동생/언니']],
    ['married', ['부부', '결혼', '혼인', '남편/아내']],
    ['friends', ['친구', '벗']],
  ];
  for (const [key, labels] of groups) {
    if (labels.some((value) => value === normalized || value.split('/').sort().join('/') === pair))
      return key;
  }
  return normalized;
}

export function relationshipReviewReason(
  label: string,
  quote: string,
  followingContext: string
): string | undefined {
  const qualified = /(?:주장|오해|믿음|추측|제안|요청|예정|계획|약속|기로)/u.test(label);
  // Only reported claims can be refuted by a subsequent statement; unrelated dialogue
  // after a direct narrative fact must not automatically invalidate that fact.
  const reported = /(?:유언|주장|말했|말하|하는\s*말|하는\s*소리|믿었|생각했)/u.test(quote);
  if (
    !qualified &&
    /(?:거짓말|거짓\s*주장|꾸며\s*댄|오해)/u.test(quote + (reported ? followingContext : ''))
  ) {
    return 'Nearby source marks a statement as false or misunderstood; factual relation requires review';
  }
  if (qualified) return undefined;
  const family =
    /(?:부부|결혼|혼인|약혼|양부|양모|양딸|양아들|부녀|모녀|남매|자매|형제|사위|장인|아내|남편|연인)/u.test(
      label
    );
  if (!family) return undefined;
  for (const sentence of quote.split(/[.!?。！？\n]/u)) {
    const text = compact(sentence);
    if (
      /(?:결혼|혼인|약혼|입양|부부|사위|장인|아내|남편).{0,16}(?:할|될|하려|되려|예정|계획)/u.test(
        text
      ) ||
      /(?:딸|아들|자식).{0,16}(?:데려오려|데리올라|삼으려|삼을|못했|못했다)/u.test(text) ||
      /(?:누이|동생|형제|남매|자매|부녀|모녀).{0,10}(?:인양|처럼|같이)/u.test(text) ||
      /(?:사랑|연인).{0,16}(?:믿었|생각했|여겼|짐작|추측)/u.test(text)
    )
      return 'Planned, figurative or believed relation is not an established fact';
  }
  return undefined;
}
