/**
 * TRIGGER GRAMMAR — the pure half of every sigil-opens-a-picker interaction.
 *
 * PROVENANCE: the `@` mention grammar in `channel-screen/Composer.tsx`,
 * generalized to any sigil so `/` (skills) and future triggers are the same
 * code path rather than a second implementation that drifts. The three rules
 * it carries are the composer's own, unchanged:
 *
 *  - START-OF-WORD ONLY. A sigil mid-word is content (`foo/bar`, `a@b.com`),
 *    not a request for a picker. The trigger exists only when the sigil
 *    follows whitespace or starts the text, and the query runs to the caret.
 *  - NAME FIRST, THEN EVERYTHING ELSE. What the user typed after the sigil is
 *    a name they are reaching for, so `rankTriggerOptions` answers in TIERS:
 *    an exact name (or alias), then a prefix, then any whitespace-word start
 *    — the composer's original rule, intact — and only then a fuzzy
 *    subsequence, with a description hit last. Tiering is the point: a row
 *    the user named exactly can never be pushed below a clever fuzzy hit.
 *  - COMMIT REPLACES THE TRIGGER. The sigil-and-query text is spliced away and
 *    the committed text stands in its place; whitespace that immediately
 *    followed the trigger is absorbed because the committed text carries its
 *    own trailing separator.
 */

export interface TriggerRange {
  /** Offset of the sigil itself. */
  start: number;
  /** The caret — the trigger always ends where the user is typing. */
  end: number;
}

export interface ActiveTrigger {
  sigil: string;
  /** What was typed after the sigil, verbatim (filtering lowercases later). */
  query: string;
  range: TriggerRange;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The trigger the caret is currently inside, or null.
 *
 * Later sigils win: in `@alice /rev` with the caret at the end, the `/` is the
 * live trigger — the `@` word is settled text behind it. The query refuses
 * whitespace and a repeat of its own sigil, exactly as the mention grammar
 * did, so typing past the word closes the picker.
 */
export function activeTrigger(
  text: string,
  caret: number,
  sigils: readonly string[],
): ActiveTrigger | null {
  const upTo = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  let best: ActiveTrigger | null = null;
  for (const sigil of sigils) {
    const escaped = escapeRegExp(sigil);
    const match = new RegExp(`(?:^|\\s)${escaped}([^\\s${escaped}]*)$`).exec(upTo);
    if (!match) continue;
    const start = upTo.length - match[1]!.length - sigil.length;
    if (best === null || start > best.range.start) {
      best = { sigil, query: match[1]!, range: { start, end: upTo.length } };
    }
  }
  return best;
}

/**
 * Splice committed text over the trigger range and say where the caret lands.
 * Returned rather than applied — the caller owns both the draft state and the
 * DOM selection, and a caret left at its old offset after an insertion before
 * it is a cursor that has silently moved.
 */
export function commitTrigger(
  text: string,
  range: TriggerRange,
  insert: string,
): { text: string; caret: number } {
  const before = text.slice(0, range.start);
  const after = text.slice(range.end).replace(/^\s+/, '');
  return { text: `${before}${insert}${after}`, caret: before.length + insert.length };
}

export interface TriggerOption {
  id: string;
  display: string;
  /** Secondary line in a picker row (a description, a kind, a group). */
  meta?: string;
  group?: string;
  /** Other names this option answers to — matched EXACTLY, never fuzzily. */
  aliases?: readonly string[];
}

/** A matched option, carrying where in `display` the query landed. */
export type RankedTriggerOption<O extends TriggerOption = TriggerOption> = O & {
  /** Character offsets into `display` the picker bolds. Empty is legal. */
  matchIndices: number[];
};

/**
 * THE TIERS, best first. A tier is a KIND of match, not a score band: no
 * amount of fuzzy cleverness may lift a row above an exact one, because the
 * one thing a person typing a full name is certain about is the name they
 * typed. (Claude Code issue #41828 is exactly this failure — an exact name
 * buried under fuzzy hits — and tiering is how its CommandMatcher avoids it.)
 */
const TIER_EXACT = 0;
const TIER_PREFIX = 1;
const TIER_WORD_START = 2;
const TIER_FUZZY = 3;
const TIER_META = 4;

/**
 * Codex's `fuzzy_match` constant, kept at its own magnitude: a hit at offset
 * 0 is worth more than any span or bonus difference, so "the row that starts
 * with your first letter" never loses to a tighter match further in.
 */
const HEAD_BONUS = 100;
/**
 * fzf V2's two bonuses. WORD_START is 8 so that the span cost of an 8-char
 * gap — the span term charges 1 per skipped character — exactly cancels it:
 * a boundary hit stops paying for itself once you have to skip a word's
 * worth of text to reach it. CONSECUTIVE is half that, the same ratio fzf
 * uses to prefer a run over two scattered boundary hits of equal length.
 */
const WORD_START_BONUS = 8;
const CONSECUTIVE_BONUS = 4;

/**
 * fzf's boundary rule: a hit is at a word start when nothing alphanumeric
 * precedes it, or when it is the capital of a camelCase hump. `display` is
 * read here, not its lowercased twin — the hump is only visible in the
 * original case.
 */
function isBoundary(display: string, at: number): boolean {
  if (at === 0) return true;
  const before = display[at - 1]!;
  const here = display[at]!;
  if (!/[A-Za-z0-9]/.test(before)) return true;
  return before === before.toLowerCase() && here !== here.toLowerCase();
}

/**
 * Codex's subsequence matcher with fzf's bonuses: every query character in
 * order, scored by how tightly they sit together. SMALLER IS BETTER, Codex's
 * convention, so the tier comparator is one `a - b` for every tier.
 *
 *   score = (span − query length)      // 1 per character skipped inside
 *         − 100 if the first hit is at offset 0
 *         − 8 per hit at a word start
 *         − 4 per hit that continues a run
 *
 * Every start position is tried because the leftmost match is not the
 * tightest one: in "recover review", `rev` matched from the first `r` spreads
 * r-e…v across nine characters, while starting at the second word gives the
 * contiguous run. Greedy-from-a-fixed-start IS optimal for that start (the
 * earliest legal position for each character can only shrink the reach), so
 * sweeping the starts is enough — no backtracking needed.
 */
function fuzzyScore(
  display: string,
  lower: string,
  needle: string,
): { score: number; matchIndices: number[] } | null {
  let best: { score: number; matchIndices: number[] } | null = null;
  for (let start = 0; start < lower.length; start += 1) {
    if (lower[start] !== needle[0]) continue;
    const matchIndices = [start];
    let q = 1;
    for (let i = start + 1; i < lower.length && q < needle.length; i += 1) {
      if (lower[i] === needle[q]) {
        matchIndices.push(i);
        q += 1;
      }
    }
    // A greedy sweep from here could not reach the end of the query; no later
    // start has more text left, so none can either.
    if (q < needle.length) break;
    const reach = matchIndices[matchIndices.length - 1]! - start + 1;
    let score = reach - needle.length;
    if (start === 0) score -= HEAD_BONUS;
    for (let k = 0; k < matchIndices.length; k += 1) {
      if (isBoundary(display, matchIndices[k]!)) score -= WORD_START_BONUS;
      if (k > 0 && matchIndices[k] === matchIndices[k - 1]! + 1) score -= CONSECUTIVE_BONUS;
    }
    if (best === null || score < best.score) best = { score, matchIndices };
  }
  return best;
}

/** Offset of the whitespace-word that starts with `needle`, or null. */
function wordStartOffset(lower: string, needle: string): number | null {
  const words = /\S+/g;
  let word: RegExpExecArray | null;
  while ((word = words.exec(lower)) !== null) {
    if (word[0].startsWith(needle)) return word.index;
  }
  return null;
}

function span(from: number, length: number): number[] {
  return Array.from({ length }, (_, i) => from + i);
}

interface Ranked<O extends TriggerOption> {
  option: O;
  tier: number;
  score: number;
  matchIndices: number[];
}

function rankOne<O extends TriggerOption>(option: O, needle: string): Ranked<O> | null {
  const display = option.display;
  const lower = display.toLowerCase();

  if (lower === needle) {
    return { option, tier: TIER_EXACT, score: 0, matchIndices: span(0, display.length) };
  }
  if (option.aliases?.some((alias) => alias.trim().toLowerCase() === needle)) {
    // Nothing in `display` matched — the row earned its place under another
    // name, and highlighting characters the user did not type would lie.
    return { option, tier: TIER_EXACT, score: 0, matchIndices: [] };
  }
  if (lower.startsWith(needle)) {
    // Shorter display first: of two rows that both start with what was typed,
    // the shorter one is the closer guess at what was meant.
    return { option, tier: TIER_PREFIX, score: display.length, matchIndices: span(0, needle.length) };
  }
  const word = wordStartOffset(lower, needle);
  if (word !== null) {
    return { option, tier: TIER_WORD_START, score: word, matchIndices: span(word, needle.length) };
  }
  const fuzzy = fuzzyScore(display, lower, needle);
  if (fuzzy) {
    return { option, tier: TIER_FUZZY, score: fuzzy.score, matchIndices: fuzzy.matchIndices };
  }
  const meta = option.meta ? wordStartOffset(option.meta.toLowerCase(), needle) : null;
  if (meta !== null) {
    // A description hit is the weakest evidence there is, and it points at no
    // character of the name — it may surface a row, never outrank one.
    return { option, tier: TIER_META, score: meta, matchIndices: [] };
  }
  return null;
}

/**
 * THE MATCHER. Rank `options` against `query`, best first, dropping what does
 * not match at all.
 *
 * Pure and total: an empty (or whitespace) query returns the catalog in its
 * own order, because a picker that has just opened is showing a CATALOG, not
 * a result — reordering it before a key is pressed makes the list move under
 * a hand that has not asked it to.
 *
 * PROVENANCE: the tier sort is Claude Code 2.1.259's CommandMatcher (exact ›
 * prefix › fuzzy, and its shortest-prefix-first rule); the fuzzy scorer is
 * Codex 0.153.2's `fuzzy_match` span score with fzf V2's word-start and
 * consecutive-run bonuses. The word-start tier is this composer's OWN prior
 * rule, kept intact and slotted above fuzzy so nothing that used to match
 * has moved down the list.
 */
export function rankTriggerOptions<O extends TriggerOption>(
  options: readonly O[],
  query: string,
): RankedTriggerOption<O>[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options.map((option) => ({ ...option, matchIndices: [] }));

  const ranked: Ranked<O>[] = [];
  for (const option of options) {
    const hit = rankOne(option, needle);
    if (hit) ranked.push(hit);
  }
  ranked.sort((a, b) => a.tier - b.tier
    || a.score - b.score
    || a.option.display.localeCompare(b.option.display)
    // Two identical displays would otherwise sort by input order, which is
    // stable per run but not across two callers holding the same catalog.
    || a.option.id.localeCompare(b.option.id));
  return ranked.map((hit) => ({ ...hit.option, matchIndices: hit.matchIndices }));
}
