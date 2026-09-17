/**
 * HAS THIS ROW'S RUN ENDED — the predicate the whole process control turns on,
 * tested against the two database rules it exists to agree with.
 *
 * The defect these lock down is not hypothetical and was not caught by any
 * surface test. Migration 174 files an interrupted session (`failed` with an
 * `ended_kind` of `server_restart`, `crashed` or `out_of_memory`) under
 * IN_PROGRESS on purpose, so that Resume is one click away. `hasEnded` read the
 * CATEGORY, so `in_progress` meant "still running", so the slot drew TERMINATE
 * — and terminate dispatches `work_session_transition(…, 'exited')` onto a row
 * the same database has already ruled terminal. Every one of those rows had a
 * button whose only possible outcome was
 *
 *     illegal work_session transition failed -> exited        (SQLSTATE 23514)
 *
 * Measured on a live node 2026-09-17: 46 of 61 in_progress sessions.
 *
 * THE TWO SERVER RULES BOTH HALVES MUST MATCH, quoted so a reader does not have
 * to take this file's word for it:
 *
 *   `public.work_session_transition` (007, last carried by 177):
 *       when current_status = p_status              then true
 *       when current_status in ('exited','failed')  then false
 *       when p_status = 'spawning'                  then false
 *       else true
 *
 *   `public.execution_resume`: only `exited`/`failed` may be resumed.
 *
 * Read together they say the two verbs are exact complements over the STATUS,
 * which is what makes one predicate able to serve both — and they say it about
 * the status, never about the tab.
 */
import { describe, expect, it } from 'vitest';
import type { StatusCategory, WorkSessionStatus } from '@tm8/contract';
import type { SessionLiveness } from '../data/seam';
import { hasEnded, processControlFor } from './actions';
import { sessionStatusOf } from './session-run';

describe('hasEnded asks about the PROCESS, not about the tab the work sits in', () => {
  /**
   * EVERY STATE A REAL SESSION ROW CAN BE IN, with the verb the server would
   * actually honour on it. `expected` is not "what the UI does" — it is which
   * of the two RPCs accepts this row, which is the only thing that makes one
   * of these buttons worth drawing.
   */
  it.each([
    // --- the bug -----------------------------------------------------------
    // 174's interrupted session. Terminate is refused by the database; resume
    // is the verb `execution_resume` accepts. This row returned FALSE before.
    ['failed', 'in_progress', 'not-running', true],
    ['failed', 'in_progress', 'unknown', true],
    // --- already agreed, and must stay that way ----------------------------
    // Ended on its own terms: 155 files it under done, and it has always read
    // as ended. The change must not disturb the case that worked.
    ['exited', 'done', 'not-running', true],
    ['failed', 'done', 'not-running', true],
    // --- the inverse the category could not see ----------------------------
    // STALE: the record still says running while nothing answers. `running ->
    // exited` is a legal transition and resume would be refused, so the run has
    // NOT ended — even filed under Done, which a tick can do at any moment.
    ['running', 'done', 'not-running', false],
    ['running', 'done', 'stale', false],
    // A GHOST that never started. `spawning -> exited` is legal; resume is not.
    // This is the case the old predicate got backwards in the other direction,
    // offering a Resume the node refuses with "only exited or failed sessions
    // can be resumed".
    ['spawning', 'done', 'unknown', false],
    // --- liveness outranks every record (D6) -------------------------------
    // Ticked while running: filed under Done AND still streaming. Whatever the
    // record says, something is answering, so the run has not ended.
    ['running', 'done', 'live', false],
    ['idle', 'done', 'live', false],
  ] as [WorkSessionStatus, StatusCategory, SessionLiveness, boolean][])(
    'status %s + category %s + liveness %s → ended: %s',
    (sessionStatus, category, liveness, expected) => {
      expect(hasEnded({ sessionStatus, category, liveness })).toBe(expected);
    },
  );

  /**
   * THE SLOT FOLLOWS THE PREDICATE, and this is the assertion that would have
   * caught the reported defect end to end: the interrupted row must not be
   * handed the verb its database refuses.
   */
  it('gives an interrupted session Resume, not the Terminate the database refuses', () => {
    const interrupted = {
      sessionStatus: 'failed' as const,
      category: 'in_progress' as const,
      liveness: 'not-running' as const,
    };
    expect(processControlFor('terminate', interrupted)).toBe('resume');
  });

  it('leaves a stale session on Terminate, which is the verb that works there', () => {
    const stale = {
      sessionStatus: 'running' as const,
      category: 'done' as const,
      liveness: 'not-running' as const,
    };
    expect(processControlFor('terminate', stale)).toBe('terminate');
  });

  /**
   * A ROW WITH NO RUN KEEPS THE OLD ANSWER — the guard that stops this change
   * from reaching every finished task in the app. `hasEnded` is consulted for
   * the tick as well as the tail slot, so a done task reading as "not ended"
   * would put an un-tick back on every completed row.
   */
  it('falls back to the category when the row has no run at all', () => {
    expect(hasEnded({ category: 'done', liveness: 'not-running' })).toBe(true);
    expect(hasEnded({ category: 'in_progress', liveness: 'not-running' })).toBe(false);
  });
});

describe('sessionStatusOf reads the run off the row, and only where there is one', () => {
  it('answers a work_session row from the state member the registry declares', () => {
    expect(sessionStatusOf({ kind: 'work_session', state: { status: 'failed' } })).toBe('failed');
  });

  /**
   * THE SCOPING IS THE POINT. A task's `state.status` is a settable work
   * status — 'done', 'in_progress' — and the registry separates the two
   * through `stateControl.filterKey`. Were that guard to go, a task's own
   * status word would flow into `hasEnded`, which compares against
   * exited/failed, and every finished task would stop reading as ended.
   */
  it('refuses to answer for a kind whose status is not a run', () => {
    expect(sessionStatusOf({ kind: 'task', state: { status: 'done' } })).toBeUndefined();
    expect(sessionStatusOf({ kind: 'doc', state: { status: 'exited' } })).toBeUndefined();
  });

  /**
   * A node too old to send the field, or a payload cached before it shipped,
   * must answer `undefined` — which `hasEnded` reads as "no run here", falling
   * back to the category rather than to a string nobody can act on.
   */
  it('answers undefined rather than a value it cannot vouch for', () => {
    expect(sessionStatusOf({ kind: 'work_session', state: {} })).toBeUndefined();
    expect(sessionStatusOf({ kind: 'work_session' })).toBeUndefined();
    expect(sessionStatusOf({ kind: 'work_session', state: { status: 'zombie' } })).toBeUndefined();
  });
});
