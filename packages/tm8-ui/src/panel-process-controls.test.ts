/**
 * A HOST THAT MOUNTS THE SESSION PANEL MUST WIRE THE SESSION PANEL'S PROCESS
 * CONTROLS — a package law, for the same reason `no-op-handler-ban` is one: the
 * failure is invisible in the component that suffers it, and invisible in the
 * diff that causes it.
 *
 * `SessionFallback` is the canvas a dead session gets, and it decides how
 * honest to look by asking whether `onResume` exists. Absent, it draws the
 * button DISABLED titled "Resume is not wired on this surface yet" — which is
 * L6 behaving exactly as designed, and is precisely why this went unnoticed for
 * as long as it did. The button was there, it carried a reason, and it read as
 * a deliberate ruling about the surface rather than as a host that forgot a
 * prop.
 *
 * MEASURED, 2026-09-17: `WorkspaceView` passed `onResumeSession` and every
 * other host did not — `AuxEntityPanel` (which is Home, Entity, Board and every
 * hosted column), `ChannelView`, `GraphScreen` and `EntityView`'s own direct
 * mount. So on the screen a user actually opens a dead session from, the one
 * verb that works on it was refused. It cost nothing to fix and nothing would
 * have told us: no test can see a prop that was never passed, and the panel
 * cannot tell "this surface cannot resume" from "this surface forgot".
 *
 * So the law is stated over the SOURCE, where the omission lives. Every file
 * that mounts `EntityDetailPanel` names the props below, or says here why it
 * does not.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The props the dead-session canvas reads as a ruling about the SURFACE. Both
 * are executors that `usePanelPrimaries` already exposes to every one of these
 * hosts, which is what makes an omission a slip rather than a decision.
 */
const REQUIRED = ['onResumeSession', 'onMarkSessionExited'] as const;

/**
 * Mounts that legitimately pass neither, each with the reason. A file earns a
 * place here by being unable to perform the verb — never by being inconvenient
 * to fix.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  // The panel's own definition and its internal re-mounts: it RECEIVES these.
  'panels/EntityDetailPanel.tsx': 'declares the props rather than passing them',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const mounts = walk(HERE)
  .filter((f) => /\.tsx$/.test(f))
  .filter((f) => !/\.(test|spec)\.tsx$/.test(f))
  .filter((f) => readFileSync(f, 'utf8').includes('<EntityDetailPanel'))
  .map((f) => relative(HERE, f));

describe('every session-panel host can actually work the session', () => {
  /**
   * The scan must FIND the hosts, or this file passes by looking at nothing —
   * the way a guard most often dies.
   */
  it('finds the mounts it is meant to be policing', () => {
    expect(mounts.length).toBeGreaterThanOrEqual(5);
    expect(mounts).toContain('views/auxPanel.tsx');
    expect(mounts).toContain('views/WorkspaceView.tsx');
  });

  it.each(REQUIRED)('every mount passes %s', (prop) => {
    const missing = mounts
      .filter((f) => !(f in EXEMPT))
      .filter((f) => !readFileSync(join(HERE, f), 'utf8').includes(`${prop}=`));
    expect(missing).toEqual([]);
  });
});
