/**
 * THE NODE STATES ITS OWN DRIFT, ONCE, BEFORE IT SERVES ANYTHING.
 *
 * The outage in full: a node was rebuilt past migration 186 and never migrated.
 * 186 removed the `codebrain` view ref from the contract, the database still
 * held a menu row seating it, and `spaces.settings` — a boot read — could not
 * parse its own row. Every Space opened blank.
 *
 * The node booted clean. `/health` answered 200. 195 of 196 operations answered
 * 200. Nothing in the logs said "migration". And because a running Node process
 * keeps its imported modules in memory, the break had been latent for THREE
 * DAYS: rebuilding `@tm8/contract` armed it, and only the next restart fired
 * it — so it presented as "I rebooted my machine and tm8 broke".
 *
 * These cases pin the guard that turns all of that into one sentence at boot.
 */
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectSchemaDrift, verifySchemaIsCurrent } from '../../src/db/schema-drift.js';

const DB_URL = process.env['TM8_TEST_DATABASE_URL'] ?? process.env['TM8_DATABASE_URL'];
const describeDb = DB_URL ? describe : describe.skip;

async function migrationsDirWith(names: readonly string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tm8-drift-'));
  for (const name of names) await writeFile(join(dir, name), '-- test\n');
  return dir;
}

describe('schema drift detection', () => {
  /**
   * A guard that cannot read its inputs must SAY SO, never assert and never
   * deny. The sidecar's migration seam takes the same line, in its own words:
   * "a skipped migration is never silently reported as applied."
   */
  it('reports a missing migrations directory as skipped rather than as clean', async () => {
    const report = await detectSchemaDrift({
      connectionString: 'postgres://nobody@127.0.0.1:1/none',
      env: { TM8_MIGRATIONS_DIR: join(tmpdir(), 'tm8-drift-does-not-exist') },
    });

    expect(report.pending).toEqual([]);
    expect(report.skipped).toMatch(/no migrations directory/);
  });

  it('does not fail the boot when the check could not run', async () => {
    // The whole point of the `skipped` channel: an unreadable ledger or an
    // unusual layout must not brick a node that was otherwise fine.
    await expect(
      verifySchemaIsCurrent({
        connectionString: 'postgres://nobody@127.0.0.1:1/none',
        env: { TM8_MIGRATIONS_DIR: join(tmpdir(), 'tm8-drift-does-not-exist') },
        log: () => {},
      }),
    ).resolves.toBeUndefined();
  });

  describeDb('against a real ledger', () => {
    it('names every pending migration, not just the first', async () => {
      // Two files no ledger can possibly list. Sorted order matters: an
      // operator reading the message applies them in this sequence.
      const dir = await migrationsDirWith([
        '900_not_applied_one.sql',
        '901_not_applied_two.sql',
        'README.md',
      ]);

      const report = await detectSchemaDrift({
        connectionString: DB_URL!,
        env: { TM8_MIGRATIONS_DIR: dir },
      });

      expect(report.skipped).toBeUndefined();
      expect(report.pending).toEqual(['900_not_applied_one.sql', '901_not_applied_two.sql']);
    });

    it('refuses the boot, and the message carries the remedy', async () => {
      const dir = await migrationsDirWith(['900_not_applied_one.sql']);

      await expect(
        verifySchemaIsCurrent({
          connectionString: DB_URL!,
          env: { TM8_MIGRATIONS_DIR: dir },
          log: () => {},
        }),
      ).rejects.toThrow(/900_not_applied_one\.sql/);

      // The operator must not have to go and look up what to run. This is the
      // sentence that was missing for the whole of the original investigation.
      await expect(
        verifySchemaIsCurrent({
          connectionString: DB_URL!,
          env: { TM8_MIGRATIONS_DIR: dir },
          log: () => {},
        }),
      ).rejects.toThrow(/db\/migrate\.mjs up/);
    });

    it('serves anyway under TM8_ALLOW_SCHEMA_DRIFT=1, and says that it is doing so', async () => {
      const dir = await migrationsDirWith(['900_not_applied_one.sql']);
      const lines: string[] = [];

      await expect(
        verifySchemaIsCurrent({
          connectionString: DB_URL!,
          env: { TM8_MIGRATIONS_DIR: dir, TM8_ALLOW_SCHEMA_DRIFT: '1' },
          log: (message) => void lines.push(message),
        }),
      ).resolves.toBeUndefined();

      // `deploy.sh --no-migrate` says the operator "owns that" — owning it
      // requires being told, every boot, that it is still true.
      expect(lines.join('\n')).toMatch(/DRIFTED, serving anyway/);
    });

    it('passes cleanly when the ledger has everything on disk', async () => {
      // The repo's own directory against the database this suite runs on. On a
      // correctly migrated node this is the real, whole-chain assertion.
      const report = await detectSchemaDrift({ connectionString: DB_URL!, env: {} });
      expect(report.skipped).toBeUndefined();
      expect(report.pending).toEqual([]);
    });
  });
});
