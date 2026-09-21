/**
 * ONE reporter for BOTH halves of the process control, for every surface that
 * mounts it.
 *
 * `PROCESS_CONTROL` resolves a single declared slot to `terminate` while a
 * session is running and to `resume` once it has ended, so any surface carrying
 * that slot can raise EITHER failure. Five surfaces mount it. One of them —
 * `WorkspaceView` — keyed its notice on the verb it was handed. The other four
 * hard-coded "Session could not be terminated" and named their callback
 * parameter `_verb`, so every refused RESUME on Home, the entity panel, a
 * channel and the graph was reported as a failed terminate.
 *
 * That is not a cosmetic slip. The two verbs fail for opposite reasons and want
 * opposite responses: a terminate fails when something is still holding the
 * process, a resume fails when there is nothing left to restore. Reported under
 * the wrong headline, the node's own message reads as a non-sequitur — a
 * terminal refusing to resume says "has no linked Teammate", and a card titled
 * "Session could not be terminated" turns that into a puzzle about a session
 * the reader was not trying to terminate.
 *
 * Lived 2026-09-21: a shell session killed by a server restart, on Home. The
 * operator read "Session could not be terminated … has no linked Teammate" and
 * reasonably concluded the session was un-closeable for a permissions reason.
 * They had pressed Resume.
 *
 * Extracted rather than fixed four times over, because four copies of a
 * conditional is how the first one drifted. `WorkspaceView`'s version is the
 * one that was right, and this is it, moved.
 */
import type { ActionRef } from '../domain';

export interface SessionVerbNotice {
  readonly id: string;
  readonly tone: 'error';
  readonly title: string;
  readonly body: string;
  readonly ttlMs: number;
}

/**
 * Build the notice for a failed process-control verb.
 *
 * The body is the node's own message, NEVER a paraphrase: paraphrasing discards
 * the remedy, and on these two verbs the remedy is the whole content. Resume's
 * refusals are the ones a reader can act on — no native id recorded, the
 * concurrency cap, an ambiguous Codex rollout, a kind that cannot be resumed —
 * so it gets the longer dwell.
 */
export function sessionVerbNotice(verb: ActionRef, error: unknown): SessionVerbNotice {
  const resumed = verb === 'resume';
  return {
    id: resumed ? 'session-resume-failed' : 'session-terminate-failed',
    tone: 'error',
    title: resumed ? 'Session could not be resumed' : 'Session could not be terminated',
    body: String((error as { message?: string })?.message ?? error),
    ttlMs: resumed ? 8_000 : 6_000,
  };
}
