import type { EntityKind, WorkSessionStatus } from '@tm8/contract';
import { getKind } from './registry';

/**
 * THE RUN'S OWN STATUS, off a row that already carries it.
 *
 * `EntitySummary.state` for a work_session carries `status` (contract.ts, the
 * `work_session` arm), so this asks a fact the row ARRIVED with — no seam
 * question, no hydration lottery, and nothing computed. It is the same ruling
 * `EntitySummary.capabilities` was added under: a fact that travels with the
 * row it describes can be read by any tile that renders at all.
 *
 * NO KIND LITERAL. Which kinds have a run is a REGISTRY fact, and the registry
 * already states it — `stateControl.filterKey` exists precisely to separate a
 * task's settable `status` from a session's observed one (see `StateControl.
 * filterKey`, which documents that split). A kind whose state control does not
 * declare `sessionStatus` has no run, and answers `undefined` here rather than
 * handing its own unrelated status word to a caller asking about processes.
 * That scoping is load-bearing, not decoration: without it a task's
 * `work_status` would flow into `hasEnded` and every finished TASK would stop
 * reading as ended.
 *
 * `undefined` therefore means "this row has no run, or none was sent" — never
 * "the run has not ended". Callers must keep their own answer for that case;
 * see `hasEnded`, which falls back to the category it always used.
 */
export function sessionStatusOf(row: { kind: EntityKind; state?: unknown }): WorkSessionStatus | undefined {
  const control = getKind(row.kind).list.stateControl;
  if (!control || control.filterKey !== 'sessionStatus') return undefined;
  const raw = (row.state as Record<string, unknown> | null | undefined)?.[control.source];
  return isWorkSessionStatus(raw) ? raw : undefined;
}

/**
 * The five values `work_sessions.status` can hold (001's CHECK, unchanged
 * since; `WorkSessionStatus` in the contract is the same list).
 *
 * Guarded rather than cast because `state` is `unknown` by the time it reaches
 * here — a node too old to send the field, or a payload cached before it
 * shipped, must answer `undefined` and not a string nobody can act on.
 */
const WORK_SESSION_STATUSES: readonly string[] = [
  'spawning',
  'running',
  'idle',
  'exited',
  'failed',
];

function isWorkSessionStatus(value: unknown): value is WorkSessionStatus {
  return typeof value === 'string' && WORK_SESSION_STATUSES.includes(value);
}
