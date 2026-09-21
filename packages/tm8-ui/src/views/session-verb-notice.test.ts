/**
 * A REFUSED RESUME IS NOT A FAILED TERMINATE.
 *
 * `PROCESS_CONTROL` resolves one declared slot to `terminate` while a session
 * runs and to `resume` once it has ended, so every surface that mounts the slot
 * can raise either failure. Five do. Four of them hard-coded the terminate
 * headline and named the callback parameter `_verb`.
 *
 * Reported from the field 2026-09-21: a shell session killed by a server
 * restart, on Home. The operator pressed **Resume**, and read
 *
 *     Session could not be terminated
 *     work session … has no linked Teammate — cannot reconstruct its launch
 *
 * and concluded the session could not be closed for a permissions reason. Both
 * lines were about a verb they had not pressed.
 */
import { describe, expect, it } from 'vitest';

import { sessionVerbNotice } from './session-verb-notice';

describe('the process control names the verb that actually failed', () => {
  it('titles a resume failure as a resume failure', () => {
    const notice = sessionVerbNotice('resume', new Error('there is nothing to restore'));

    expect(notice.title).toBe('Session could not be resumed');
    expect(notice.id).toBe('session-resume-failed');
  });

  it('titles a terminate failure as a terminate failure', () => {
    const notice = sessionVerbNotice('terminate', new Error('still holding the process'));

    expect(notice.title).toBe('Session could not be terminated');
    expect(notice.id).toBe('session-terminate-failed');
  });

  /**
   * The two ids must differ, not merely the two titles. They are the notice
   * host's dedupe key: sharing one would let a resume failure replace a
   * terminate failure in place, which is the same lie by a different route.
   */
  it('gives the two verbs different notice ids', () => {
    expect(sessionVerbNotice('resume', new Error('a')).id).not.toBe(
      sessionVerbNotice('terminate', new Error('a')).id,
    );
  });

  /**
   * The node's own words, never a paraphrase — on these verbs the remedy IS the
   * message, and a summary discards it.
   */
  it('carries the node’s message through verbatim', () => {
    const body = "work session x is a 'shell' session, and resume restores an agent conversation";
    expect(sessionVerbNotice('resume', new Error(body)).body).toBe(body);
  });

  it('survives a thrown value that is not an Error', () => {
    expect(sessionVerbNotice('resume', 'plain string').body).toBe('plain string');
  });

  /** Resume's refusals are actionable, so they are worth a longer read. */
  it('dwells longer on the refusal a reader can act on', () => {
    expect(sessionVerbNotice('resume', new Error('a')).ttlMs).toBeGreaterThan(
      sessionVerbNotice('terminate', new Error('a')).ttlMs,
    );
  });
});
