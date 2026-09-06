/**
 * The trigger grammar (`triggers.ts`) — pure, so every rule the composer's
 * `@` behaviour established is pinned here where it can be tested without a
 * DOM: start-of-word only, later sigil wins, the commit splice with its
 * caret, and — since the prefix filter became a ranked matcher — one test per
 * TIER plus the ordering law between them.
 */
import { describe, expect, it } from 'vitest';
import { activeTrigger, commitTrigger, rankTriggerOptions } from './triggers';

const SIGILS = ['@', '/'];

describe('activeTrigger', () => {
  it('fires at the start of the text and after whitespace', () => {
    expect(activeTrigger('@', 1, SIGILS)).toMatchObject({ sigil: '@', query: '', range: { start: 0, end: 1 } });
    expect(activeTrigger('hi @al', 6, SIGILS)).toMatchObject({ sigil: '@', query: 'al', range: { start: 3, end: 6 } });
    expect(activeTrigger('line\n/rev', 9, SIGILS)).toMatchObject({ sigil: '/', query: 'rev' });
  });

  it('does not fire mid-word — a sigil inside a token is content', () => {
    expect(activeTrigger('foo/bar', 7, SIGILS)).toBeNull();
    expect(activeTrigger('a@b.com', 7, SIGILS)).toBeNull();
    expect(activeTrigger('http://x', 8, SIGILS)).toBeNull();
  });

  it('the trigger nearest the caret wins when two are live', () => {
    expect(activeTrigger('@alice /rev', 11, SIGILS)).toMatchObject({ sigil: '/', query: 'rev' });
  });

  it('closes at whitespace — typing past the word ends the trigger', () => {
    expect(activeTrigger('@alice hello', 12, SIGILS)).toBeNull();
  });

  it('a doubled sigil is not a trigger — the query refuses its own sigil', () => {
    expect(activeTrigger('@@', 2, SIGILS)).toBeNull();
  });

  it('reads only up to the caret — text after it is not the trigger', () => {
    expect(activeTrigger('@al and more', 3, SIGILS)).toMatchObject({ query: 'al' });
  });

  it('only registered sigils fire', () => {
    expect(activeTrigger('#tag', 4, SIGILS)).toBeNull();
    expect(activeTrigger('/rev', 4, ['@'])).toBeNull();
  });
});

describe('commitTrigger', () => {
  it('splices the committed text over the trigger and lands the caret after it', () => {
    const next = commitTrigger('hi @al there', { start: 3, end: 6 }, '@alice ');
    expect(next.text).toBe('hi @alice there');
    expect(next.caret).toBe(10);
  });

  it('absorbs whitespace that followed the trigger — the insert carries its own separator', () => {
    const next = commitTrigger('@al  tail', { start: 0, end: 3 }, '@alice ');
    expect(next.text).toBe('@alice tail');
  });

  it('works at the end of the text', () => {
    const next = commitTrigger('see /re', { start: 4, end: 7 }, '[/review](tm8://skill/abc) ');
    expect(next.text).toBe('see [/review](tm8://skill/abc) ');
    expect(next.caret).toBe(next.text.length);
  });
});

describe('rankTriggerOptions — the tiers', () => {
  const ids = (options: readonly { id: string }[]) => options.map((o) => o.id);

  it('an empty query returns the catalog, in catalog order', () => {
    // A picker that has just opened is showing a CATALOG, not a result;
    // reordering it before a key is pressed moves the list under the hand.
    const catalog = [
      { id: 'z', display: 'Zoe' },
      { id: 'a', display: 'Alice Chen' },
    ];
    expect(ids(rankTriggerOptions(catalog, ''))).toEqual(['z', 'a']);
    expect(ids(rankTriggerOptions(catalog, '   '))).toEqual(['z', 'a']);
    expect(rankTriggerOptions(catalog, '')[0]!.matchIndices).toEqual([]);
  });

  it('TIER 1 — an exact name wins, even when a fuzzy hit scores better', () => {
    /*
     * Claude Code issue #41828 in one assertion. `preview` matches `rev` as a
     * contiguous run (two consecutive-run bonuses ⇒ score −8) and `rev`
     * matches itself at score 0 — the NUMBERS say `preview`. Tiering says the
     * name the user typed exactly, and tiering is what ships.
     */
    const ranked = rankTriggerOptions([
      { id: 'preview', display: 'preview' },
      { id: 'rev', display: 'rev' },
    ], 'rev');
    expect(ids(ranked)).toEqual(['rev', 'preview']);
  });

  it('TIER 1 — an alias is exact too, and outranks another row’s prefix', () => {
    const ranked = rankTriggerOptions([
      { id: 'create', display: 'Create Task' },
      { id: 'review', display: 'Code Review', aliases: ['cr'] },
    ], 'cr');
    expect(ids(ranked)).toEqual(['review', 'create']);
    // Nothing in `Code Review` matched `cr` — highlighting letters the user
    // did not type would be a lie about why the row is here.
    expect(ranked[0]!.matchIndices).toEqual([]);
  });

  it('TIER 2 — a display prefix, shorter display first, case-insensitively', () => {
    const ranked = rankTriggerOptions([
      { id: 'long', display: 'code review checklist' },
      { id: 'short', display: 'code' },
      { id: 'mid', display: 'code review' },
    ], 'COD');
    expect(ids(ranked)).toEqual(['short', 'mid', 'long']);
    expect(ranked[0]!.matchIndices).toEqual([0, 1, 2]);
  });

  it('TIER 3 — any whitespace-word start, so a surname still reaches its row', () => {
    const ranked = rankTriggerOptions([{ id: 'a', display: 'Alice Chen' }], 'chen');
    expect(ids(ranked)).toEqual(['a']);
    expect(ranked[0]!.matchIndices).toEqual([6, 7, 8, 9]);
  });

  it('TIER 3 outranks TIER 4 — a word start beats a mid-word subsequence', () => {
    const ranked = rankTriggerOptions([
      { id: 'fuzzy', display: 'preview' },
      { id: 'word', display: 'code review' },
    ], 'rev');
    expect(ids(ranked)).toEqual(['word', 'fuzzy']);
  });

  it('TIER 4 — a subsequence matches, in order, with the offsets to bold', () => {
    const ranked = rankTriggerOptions([{ id: 'a', display: 'code review' }], 'crev');
    expect(ids(ranked)).toEqual(['a']);
    expect(ranked[0]!.matchIndices).toEqual([0, 5, 6, 7]);
  });

  it('TIER 4 — out of order is not a subsequence and does not match', () => {
    expect(rankTriggerOptions([{ id: 'a', display: 'code review' }], 'verc')).toEqual([]);
  });

  it('TIER 4 — a match anchored at offset 0 beats a tighter one further in', () => {
    /*
     * Codex's −100 head bonus, and it is deliberately larger than any span or
     * boundary term: `recover-review` has a contiguous `rev` at offset 8, but
     * the letters the reader is watching while they type are the ones at the
     * front of the name. Anchored-at-the-start wins, and the offsets say so.
     */
    const ranked = rankTriggerOptions([{ id: 'a', display: 'recover-review' }], 'rev');
    expect(ranked[0]!.matchIndices).toEqual([0, 1, 4]);
  });

  it('TIER 4 — with no anchor at 0, the tightest run wins over the leftmost', () => {
    // Nothing starts with `r` here, so every candidate pays the same span
    // arithmetic and the contiguous run at the last word takes it.
    const ranked = rankTriggerOptions([{ id: 'a', display: 'code recover-review' }], 'rev');
    expect(ranked[0]!.matchIndices).toEqual([13, 14, 15]);
  });

  it('TIER 5 — a description hit surfaces a row but never outranks a name', () => {
    const ranked = rankTriggerOptions([
      { id: 'described', display: 'Ship it', meta: 'the release checklist' },
      { id: 'named', display: 'Checklist' },
    ], 'checklist');
    expect(ids(ranked)).toEqual(['named', 'described']);
    // The name says nothing about `checklist` — no offsets to bold.
    expect(ranked[1]!.matchIndices).toEqual([]);
  });

  it('drops what does not match at all', () => {
    expect(rankTriggerOptions([
      { id: 'a', display: 'Alice Chen' },
      { id: 'b', display: 'Bob' },
    ], 'zzq')).toEqual([]);
  });

  it('ties break alphabetically, so the same catalog ranks the same way twice', () => {
    const ranked = rankTriggerOptions([
      { id: 'b', display: 'rev b' },
      { id: 'a', display: 'rev a' },
    ], 'rev');
    expect(ids(ranked)).toEqual(['a', 'b']);
  });
});

describe('rankTriggerOptions — the cost of ranking a whole catalog', () => {
  /*
   * MEASURED, not argued. The design artifact carries a computed bound; this
   * is the figure from the machine that ran it. 500 options is the ceiling
   * `skills.ts` pages to, and 10 characters is a long query — the picker
   * re-ranks on EVERY keystroke, so anything near a frame (16.7 ms) would be
   * felt as the list lagging the typing.
   */
  it('ranks 500 options against a 10-character query well inside a frame', () => {
    const options = Array.from({ length: 500 }, (_, i) => ({
      id: `s${i}`,
      display: `skill ${i} review checklist variant ${i % 7}`,
      meta: `what skill ${i} is for, at some length`,
    }));
    const started = performance.now();
    const ranked = rankTriggerOptions(options, 'srevcheckl');
    const elapsed = performance.now() - started;
    /* Printed, not just asserted: the artifact carries a COMPUTED bound and
       the reviewer needs the measured one. Read it with --reporter=verbose. */
    console.log(`rankTriggerOptions: 500 options x 10-char query = ${elapsed.toFixed(2)} ms`);
    expect(ranked.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(20); // measured 0.70 ms on the authoring machine
  });
});
