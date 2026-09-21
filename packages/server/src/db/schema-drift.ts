/**
 * The boot guard that refuses to serve a database the build has outgrown.
 *
 * ## The outage this exists to prevent
 *
 * A node ran `bun run build` and never ran `db/migrate.mjs up`. The build moved
 * past migration 186, which removed the `codebrain` view ref from the contract's
 * `MenuViewRef` union; the database stayed at 184, so a stored menu payload
 * still seated it. `spaces.settings` — a BOOT read — could no longer parse its
 * own row, and every Space opened to an empty workspace.
 *
 * What made it expensive was not the breakage but its SHAPE. The node booted
 * perfectly. `/health` answered 200. 195 of 196 operations answered 200. One
 * read failed, and it happened to be the one the shell cannot start without.
 * Nothing in the logs mentioned migrations, a schema, or a version.
 *
 * Worse, it was INVISIBLE FOR THREE DAYS. A running Node process holds its
 * imported modules in memory: `packages/server/dist/index.js` resolves
 * `@tm8/contract` at import time, so rebuilding the contract package alone is
 * enough to arm this, while the process already running keeps serving the old
 * enum quite happily. The defect surfaces at the next RESTART — which is why it
 * presented as "I rebooted my machine and tm8 broke", three days after the
 * commit that actually broke it.
 *
 * ## Why a guard and not a nicer error
 *
 * `spaces.settings` now answers `invariant_violation` and names the field, and
 * the boot card now tells the operator to migrate. That is the right treatment
 * for the symptom and it is not a cure: it only fires for the ONE read that
 * happened to trip, it fires per-request rather than once, and it says nothing
 * about the other migrations a behind database is also missing. Drift is a
 * property of the NODE, so the node should state it at startup, once, before it
 * begins answering questions it may be answering wrongly.
 *
 * `deploy/prod/deploy.sh` has documented this behaviour since it was written —
 * `--no-migrate` is annotated "it will then refuse to start on a schema
 * mismatch — you own that". No such check existed anywhere in the server. This
 * file makes the documentation true.
 *
 * ## Why this is fatal by default
 *
 * A build ahead of its schema is not degraded, it is WRONG, and wrong in a
 * direction that writes. `EntityKindDriftError` and `WorkStatusDriftError`
 * already take a hard line on reading a value the contract does not name; a
 * pending migration is the same fault one layer earlier, and it is the layer
 * where an operator can still fix it in one command. Serving reads against it
 * risks answering with data the contract cannot describe, and serving writes
 * risks persisting rows the next migration will have to clean up.
 *
 * `TM8_ALLOW_SCHEMA_DRIFT=1` downgrades the refusal to a warning, for the case
 * `deploy.sh` already names: an operator who has deliberately skipped the
 * migrate step and owns that decision.
 */

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';

/** Files in `db/migrations` are `NNN_name.sql`; nothing else counts. */
const MIGRATION_FILE_RE = /^\d+_.*\.sql$/;

export interface SchemaDriftReport {
  /** Migration filenames on disk that the ledger does not list, in order. */
  readonly pending: readonly string[];
  /** Why no comparison was made, when one could not be. */
  readonly skipped?: string;
}

/**
 * Where `db/migrations` lives relative to this module.
 *
 * Four levels up lands on the repo root from BOTH `packages/server/src/db` and
 * `packages/server/dist/db`, which is the only reason a single constant works
 * for the compiled and the source tree alike. `TM8_MIGRATIONS_DIR` overrides it
 * for a layout that is neither.
 */
function migrationsDir(env: NodeJS.ProcessEnv): string {
  const override = env['TM8_MIGRATIONS_DIR'];
  if (override) return override;
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'db', 'migrations');
}

/**
 * Compare `db/migrations` against the `applied_migrations` ledger.
 *
 * Never throws for an environmental reason. Every "cannot tell" answer comes
 * back as `skipped`, because a guard that cannot read its inputs must say so
 * rather than either assert or deny — and the caller decides how loud that is.
 */
export async function detectSchemaDrift(opts: {
  connectionString: string;
  env?: NodeJS.ProcessEnv;
}): Promise<SchemaDriftReport> {
  const env = opts.env ?? process.env;
  const dir = migrationsDir(env);

  let onDisk: string[];
  try {
    onDisk = (await readdir(dir)).filter((name) => MIGRATION_FILE_RE.test(name)).sort();
  } catch {
    return { pending: [], skipped: `no migrations directory at ${dir}` };
  }
  if (onDisk.length === 0) return { pending: [], skipped: `no migration files under ${dir}` };

  // A short-lived pool of its own, exactly as `verifyDeliveryPrincipal` uses.
  // It must NOT go through `Db`: every `Db` transaction takes `SET LOCAL ROLE
  // tm8_app`, and `tm8_app` has no select on `applied_migrations` — the ledger
  // belongs to the migration runner's role. The connection URL authenticates as
  // that owner before any role is assumed, which is the one seat that can read
  // it.
  const pool = new Pool({ connectionString: opts.connectionString, max: 1 });
  // An 'error' event with no listener is rethrown by EventEmitter and takes the
  // process down — during boot that reads as a crash, not as this check.
  // Mirrors the guard in db/client.ts and in verifyDeliveryPrincipal.
  pool.on('error', (err) => {
    console.error(`[schema-drift] idle client error on the ledger pool: ${err.message}`);
  });
  try {
    const ledger = await pool.query<{ to_regclass: string | null }>(
      "select to_regclass('public.applied_migrations') as to_regclass",
    );
    if (ledger.rows[0]?.to_regclass == null) {
      // An unprovisioned database, not a drifted one. The bootstrap paths
      // (`db/migrate.mjs`, the sidecar) create the ledger as their first act, so
      // reaching here means migrations have not started rather than that they
      // have fallen behind — and refusing would deadlock a first boot.
      return { pending: [], skipped: 'no applied_migrations ledger yet (database not provisioned)' };
    }
    const applied = await pool.query<{ filename: string }>(
      'select filename from public.applied_migrations',
    );
    const seen = new Set(applied.rows.map((row) => row.filename));
    return { pending: onDisk.filter((name) => !seen.has(name)) };
  } catch (err) {
    // Chiefly a privilege error: a deployment whose server URL authenticates as
    // a role without select on the ledger can never run this check, and must
    // still be able to boot.
    return { pending: [], skipped: `could not read applied_migrations: ${(err as Error).message}` };
  } finally {
    await pool.end();
  }
}

/**
 * Fail the boot when the database is behind the build.
 *
 * Awaited before `server.listen()`, so a drifted node never serves a request —
 * the same placement, and for the same reason, as `verifyDeliveryPrincipal`.
 */
export async function verifySchemaIsCurrent(opts: {
  connectionString: string;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}): Promise<void> {
  const env = opts.env ?? process.env;
  const log = opts.log ?? ((message: string) => console.error(message));
  const report = await detectSchemaDrift({ connectionString: opts.connectionString, env });

  if (report.skipped) {
    // Loud, and not fatal. The sidecar's migration seam takes the same line: a
    // check that did not run is never reported as a check that passed.
    log(`  schema: NOT VERIFIED — ${report.skipped}`);
    return;
  }
  if (report.pending.length === 0) return;

  const names = report.pending.join(', ');
  const message =
    `this build needs ${report.pending.length} migration(s) the database has not applied: ${names}. ` +
    `A node whose schema is behind its build answers most reads correctly and a few with data the ` +
    `frozen contract cannot describe, which is why this is refused at boot rather than discovered ` +
    `one broken screen at a time. Run \`node db/migrate.mjs up\` against this database, or start ` +
    `with TM8_ALLOW_SCHEMA_DRIFT=1 to serve anyway.`;

  if (env['TM8_ALLOW_SCHEMA_DRIFT'] === '1') {
    log(`  schema: DRIFTED, serving anyway (TM8_ALLOW_SCHEMA_DRIFT=1) — ${message}`);
    return;
  }
  throw new Error(message);
}
