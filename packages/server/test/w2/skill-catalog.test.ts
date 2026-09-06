/**
 * `skills.catalog` — the union read, and the four things about it that are
 * easy to get wrong and impossible to notice later:
 *
 *  1. a `.agents/skills` symlink onto `.claude/skills` is ONE folder. Scanned
 *     as two roots it doubles every skill in the repo, and the picker then
 *     shows 90 rows for 45 skills, half of them mislabelled Codex.
 *  2. a SKILL.md with no frontmatter `name` is still a skill — the harness
 *     addresses it by its DIRECTORY. Dropping it silently removes real skills
 *     from the list with no way to tell from the outside.
 *  3. a directory with no readable SKILL.md (`_shared`, a stray folder) is
 *     skipped, not fatal. One of those must not take the whole catalog down.
 *  4. a non-member gets `forbidden`, never a filesystem listing. The folder
 *     half of this answer describes the NODE's disk, so the Space boundary is
 *     the only thing standing between it and everyone.
 *
 * Every fixture is built under one temp root and `HOME` is pointed inside it,
 * so nothing here reads the developer's real skills and the assertions are
 * exact rather than "at least".
 */
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SkillCatalogSchema, getOperation, type OperationName } from '@tm8/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Db, DbClaims, Querier } from '../../src/db/types.js';
import type { FacadeDeps } from '../../src/facade/deps.js';
import { registerW2SkillsHandlers } from '../../src/facade/handlers/w2/skills.js';
import { HandlerRegistry } from '../../src/facade/registry.js';
import {
  findProjectRoot,
  homeSkillRoots,
  normalizeSkillName,
  parseSkillFrontmatter,
  projectSkillRoots,
  readSkillCatalog,
  scanSkillRoots,
  MAX_SKILLS_PER_ROOT,
} from '../../src/facade/services/w2/skill-catalog.js';
import type { OperationHandler, RequestContext } from '../../src/http/types.js';

const IDS = {
  space: '00000000-0000-7000-8000-000000000801',
  project: '00000000-0000-7000-8000-000000000802',
  other: '00000000-0000-7000-8000-000000000803',
  skill: '00000000-0000-7000-8000-000000000804',
};

const OWNER = {
  identityId: 'skill-catalog-owner',
  accountId: '00000000-0000-7000-8000-000000000899',
  username: 'skill-catalog-owner',
  isNodeAdmin: true,
  isOwner: true,
};

let scratch: string;
/** The project ROOT — carries `.git`, so the `.agents` walk starts here. */
let projectRoot: string;
/** The project's `working_dir` — a package one level below the root. */
let workingDir: string;
let home: string;
let originalHome: string | undefined;

function skillMd(name: string | null, description: string, argumentHint?: string): string {
  const lines = ['---'];
  if (name !== null) lines.push(`name: ${name}`);
  lines.push(`description: "${description}"`);
  if (argumentHint) lines.push(`argument-hint: "${argumentHint}"`);
  lines.push('---', '', '# body');
  return lines.join('\n');
}

async function skillDir(root: string, name: string, front: string): Promise<void> {
  await mkdir(join(root, name), { recursive: true });
  await writeFile(join(root, name, 'SKILL.md'), front);
}

beforeEach(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'tm8-skill-catalog-')));
  projectRoot = join(scratch, 'repo');
  workingDir = join(projectRoot, 'pkg');
  home = join(scratch, 'home');

  // The project root, identified by `.git` and carrying a repo-wide Codex set.
  await mkdir(join(projectRoot, '.git'), { recursive: true });
  await skillDir(join(projectRoot, '.agents', 'skills'), 'repo-wide', skillMd('repo-wide', 'from the project root'));

  // The working directory: Claude Code skills, a legacy command, a Codex set,
  // a folder that is NOT a skill, and `.agents` symlinked onto `.claude`.
  const claudeSkills = join(workingDir, '.claude', 'skills');
  await skillDir(claudeSkills, 'alpha', skillMd('alpha', 'project alpha', '<path>'));
  await skillDir(claudeSkills, 'nameless', skillMd(null, 'declares no name'));
  await mkdir(join(claudeSkills, '_shared'), { recursive: true });
  await mkdir(join(workingDir, '.claude', 'commands'), { recursive: true });
  await writeFile(join(workingDir, '.claude', 'commands', 'legacy.md'), skillMd('legacy', 'a legacy command'));
  await skillDir(join(workingDir, '.codex', 'skills'), 'codex-project', skillMd('codex-project', 'project codex'));
  await symlink(join(workingDir, '.claude'), join(workingDir, '.agents'));

  // The node user's home.
  await skillDir(join(home, '.claude', 'skills'), 'alpha', skillMd('alpha', 'personal alpha'));
  await skillDir(join(home, '.claude', 'skills', 'synced'), 'synced-one', skillMd('synced-one', 'a synced skill'));
  await skillDir(join(home, '.agents', 'skills'), 'home-codex', skillMd('home-codex', 'personal codex'));
  await skillDir(join(home, '.codex', 'skills', '.system'), 'bundled', skillMd('bundled', 'a bundled skill'));

  originalHome = process.env.HOME;
  // `os.homedir()` reads $HOME on POSIX, which is the whole reason the handler
  // needs no home seam of its own — see `homeSkillRoots`.
  process.env.HOME = home;
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  await rm(scratch, { recursive: true, force: true });
});

const SKILL_ROW = { id: IDS.skill, name: 'graph skill', description: 'a tm8 skill entity' };

class FakeDb implements Db {
  /** Empty ⇒ the caller is not a member of any space. */
  members: string[] = [OWNER.identityId];
  projects: Array<{ id: string; working_dir: string }> = [
    { id: IDS.project, working_dir: workingDir },
  ];
  skills: Array<typeof SKILL_ROW> = [SKILL_ROW];
  readonly seen: string[] = [];

  queryImpl = async <R>(sql: string, params: readonly unknown[]): Promise<R[]> => {
    this.seen.push(sql);
    if (/from public\.members/.test(sql)) {
      return (this.members.includes(String(params[1])) ? [{ entity_id: 'member-row' }] : []) as R[];
    }
    if (/from public\.projects/.test(sql)) {
      const wanted = params[1];
      return this.projects.filter((p) => wanted === null || p.id === wanted) as unknown as R[];
    }
    if (/from public\.entities/.test(sql)) return this.skills as unknown as R[];
    throw new Error(`unexpected query: ${sql}`);
  };

  tx<T>(_claims: DbClaims, fn: (q: Querier) => Promise<T>): Promise<T> {
    return fn({
      query: <R>(sql: string, params: readonly unknown[] = []) => this.queryImpl<R>(sql, params),
      rpc: async <T>(): Promise<T> => {
        throw new Error('skills.catalog is a read and must not call an rpc');
      },
    });
  }

  query<R>(_claims: DbClaims, sql: string, params: readonly unknown[] = []): Promise<R[]> {
    return this.queryImpl<R>(sql, params);
  }

  async rpc<T>(): Promise<T> {
    throw new Error('skills.catalog is a read and must not call an rpc');
  }

  async end(): Promise<void> {}
}

function deps(db: Db): FacadeDeps {
  return { db, config: {} as FacadeDeps['config'], owner: async () => OWNER };
}

function request(
  opName: OperationName,
  options: { params?: Record<string, string>; query?: string } = {},
): RequestContext {
  const op = getOperation(opName);
  return {
    op,
    opName,
    params: options.params ?? {},
    query: new URLSearchParams(options.query),
    body: undefined,
    requestId: `req-${opName}`,
    identity: { kind: 'auto-owner', identityId: OWNER.identityId },
    headers: {},
    method: op.method,
    path: op.path,
  };
}

function handler(db: Db): OperationHandler {
  const registry = new HandlerRegistry();
  registerW2SkillsHandlers(registry, deps(db));
  const found = registry.get('skills.catalog');
  if (!found) throw new Error('skills.catalog was not registered');
  return found;
}

const claims = (identityId = OWNER.identityId): DbClaims => ({
  identityId,
  nodeAdmin: true,
  requestId: 'req-test',
});

describe('the skill catalog seam', () => {
  it('registers exactly one operation', () => {
    const registry = new HandlerRegistry();
    registerW2SkillsHandlers(registry, deps(new FakeDb()));
    expect(registry.implemented()).toEqual(['skills.catalog']);
  });
});

describe('frontmatter', () => {
  it('reads a quoted scalar, a folded block, and an argument hint', () => {
    expect(parseSkillFrontmatter([
      '---',
      'name: pre-merge-verify',
      'description: >-',
      "  Run a branch's own build on an isolated stack,",
      '  before sending the PR for review.',
      'argument-hint: "[pr-number]"',
      '---',
      '',
      '# body that must not be parsed',
      'name: not-frontmatter',
    ].join('\n'))).toEqual({
      name: 'pre-merge-verify',
      description: "Run a branch's own build on an isolated stack, before sending the PR for review.",
      argumentHint: '[pr-number]',
    });
  });

  it('is empty for a file with no frontmatter at all', () => {
    expect(parseSkillFrontmatter('# just a heading\n\nsome prose\n')).toEqual({});
  });

  it('normalizes names the way Claude Code compares them', () => {
    expect(normalizeSkillName('Code Review')).toBe(normalizeSkillName('code-review'));
    expect(normalizeSkillName('code_review')).toBe('codereview');
  });
});

describe('project roots', () => {
  it('finds the `.git` root and walks `.agents/skills` from there down to the working dir', async () => {
    expect(await findProjectRoot(workingDir)).toBe(projectRoot);
    const roots = (await projectSkillRoots(workingDir)).map((root) => root.path);
    expect(roots).toEqual([
      join(workingDir, '.claude', 'skills'),
      join(workingDir, '.claude', 'commands'),
      join(workingDir, '.codex', 'skills'),
      join(projectRoot, '.agents', 'skills'),
      join(workingDir, '.agents', 'skills'),
    ]);
  });

  it('treats the working directory as the root when nothing marks one', async () => {
    const orphan = join(scratch, 'orphan');
    await mkdir(orphan, { recursive: true });
    expect(await findProjectRoot(orphan)).toBe(orphan);
    expect((await projectSkillRoots(orphan)).map((r) => r.path)).toEqual([
      join(orphan, '.claude', 'skills'),
      join(orphan, '.claude', 'commands'),
      join(orphan, '.codex', 'skills'),
      join(orphan, '.agents', 'skills'),
    ]);
  });
});

describe('scanning', () => {
  it('collapses the symlinked root, names the nameless, skips the non-skill, and lets personal win', async () => {
    const scan = await scanSkillRoots([
      ...await projectSkillRoots(workingDir),
      ...homeSkillRoots(home),
    ]);

    // `pkg/.agents` IS `pkg/.claude`, so `pkg/.agents/skills` never becomes a
    // second root: eleven declared, nine opened, and one of the two that
    // vanished is that symlink. `~/.codex/skills` IS opened even though it
    // holds no skill of its own — it exists (it is `.system`'s parent), and
    // "opened and empty" is a different fact from "not there", which is exactly
    // what `roots` is for.
    expect(scan.roots).toEqual([
      join(workingDir, '.claude', 'skills'),
      join(workingDir, '.claude', 'commands'),
      join(workingDir, '.codex', 'skills'),
      join(projectRoot, '.agents', 'skills'),
      join(home, '.claude', 'skills'),
      join(home, '.claude', 'skills', 'synced'),
      join(home, '.agents', 'skills'),
      join(home, '.codex', 'skills'),
      join(home, '.codex', 'skills', '.system'),
    ]);
    expect(scan.truncated).toBe(false);

    expect(scan.entries).toEqual([
      {
        id: 'claude-code:personal:alpha',
        name: 'alpha',
        description: 'personal alpha',
        source: 'claude-code',
        scope: 'personal',
        path: join(home, '.claude', 'skills', 'alpha', 'SKILL.md'),
      },
      {
        id: 'codex:system:bundled',
        name: 'bundled',
        description: 'a bundled skill',
        source: 'codex',
        scope: 'system',
        path: join(home, '.codex', 'skills', '.system', 'bundled', 'SKILL.md'),
      },
      {
        id: 'codex:project:codex-project',
        name: 'codex-project',
        description: 'project codex',
        source: 'codex',
        scope: 'project',
        path: join(workingDir, '.codex', 'skills', 'codex-project', 'SKILL.md'),
      },
      {
        id: 'codex:personal:home-codex',
        name: 'home-codex',
        description: 'personal codex',
        source: 'codex',
        scope: 'personal',
        path: join(home, '.agents', 'skills', 'home-codex', 'SKILL.md'),
      },
      {
        id: 'claude-code:project:legacy',
        name: 'legacy',
        description: 'a legacy command',
        source: 'claude-code',
        scope: 'project',
        path: join(workingDir, '.claude', 'commands', 'legacy.md'),
      },
      {
        // NO frontmatter `name` — the directory is the name, and the row lives.
        id: 'claude-code:project:nameless',
        name: 'nameless',
        description: 'declares no name',
        source: 'claude-code',
        scope: 'project',
        path: join(workingDir, '.claude', 'skills', 'nameless', 'SKILL.md'),
      },
      {
        id: 'codex:project:repo-wide',
        name: 'repo-wide',
        description: 'from the project root',
        source: 'codex',
        scope: 'project',
        path: join(projectRoot, '.agents', 'skills', 'repo-wide', 'SKILL.md'),
      },
      {
        id: 'claude-code:personal:synced-one',
        name: 'synced-one',
        description: 'a synced skill',
        source: 'claude-code',
        scope: 'personal',
        path: join(home, '.claude', 'skills', 'synced', 'synced-one', 'SKILL.md'),
      },
    ]);
    // `_shared` has no SKILL.md and is absent rather than fatal.
    expect(scan.entries.some((entry) => entry.name === '_shared')).toBe(false);
  });

  it('carries the argument hint when the file declares one, and only then', async () => {
    // `alpha` in the project declares one; personal `alpha` wins the name, so
    // narrow to the project roots to observe it.
    const scan = await scanSkillRoots(await projectSkillRoots(workingDir));
    expect(scan.entries.find((entry) => entry.name === 'alpha')?.argumentHint).toBe('<path>');
    expect(scan.entries.find((entry) => entry.name === 'legacy')).not.toHaveProperty('argumentHint');
  });

  it('a symlinked skill folder INSIDE a root is not a door out of it', async () => {
    const outside = join(scratch, 'outside');
    await skillDir(outside, 'escapee', skillMd('escapee', 'must not be listed'));
    await symlink(join(outside, 'escapee'), join(workingDir, '.claude', 'skills', 'escapee'));

    const scan = await scanSkillRoots(await projectSkillRoots(workingDir));
    expect(scan.entries.map((entry) => entry.name)).not.toContain('escapee');
  });

  it('an absent root is not an error — it is a fact about this node', async () => {
    const scan = await scanSkillRoots(homeSkillRoots(join(scratch, 'no-such-home')));
    expect(scan).toEqual({ roots: [], entries: [], truncated: false });
  });

  it('states a cut rather than absorbing it', async () => {
    const wide = join(scratch, 'wide', '.claude', 'skills');
    for (let index = 0; index <= MAX_SKILLS_PER_ROOT; index += 1) {
      const name = `skill-${String(index).padStart(4, '0')}`;
      await skillDir(wide, name, skillMd(name, ''));
    }
    const scan = await scanSkillRoots([
      { path: wide, source: 'claude-code', scope: 'project', layout: 'skill-dir' },
    ]);
    expect(scan.entries).toHaveLength(MAX_SKILLS_PER_ROOT);
    expect(scan.truncated).toBe(true);
  });
});

describe('the operation', () => {
  it('unions the Space skill entities with the folder rows, and validates as the contract DTO', async () => {
    const db = new FakeDb();
    const catalog = await handler(db)(request('skills.catalog', { params: { spaceId: IDS.space } }));

    expect(SkillCatalogSchema.safeParse(catalog).success).toBe(true);
    const dto = SkillCatalogSchema.parse(catalog);
    expect(dto.spaceId).toBe(IDS.space);
    expect(dto.projectId).toBeNull();

    const graph = dto.entries.filter((entry) => entry.source === 'tm8');
    expect(graph).toEqual([{
      id: IDS.skill,
      name: 'graph skill',
      description: 'a tm8 skill entity',
      source: 'tm8',
      scope: 'space',
      entityId: IDS.skill,
    }]);
    // The graph row sorts in among the folder rows, and none of them carries an
    // `entityId` — the reference form is read off the shape.
    expect(dto.entries.map((entry) => entry.name)).toEqual([
      'alpha', 'bundled', 'codex-project', 'graph skill',
      'home-codex', 'legacy', 'nameless', 'repo-wide', 'synced-one',
    ]);
    expect(dto.entries.filter((entry) => entry.entityId !== undefined)).toHaveLength(1);
    expect(dto.entries.filter((entry) => entry.path !== undefined)).toHaveLength(8);
  });

  it('a tm8 entity row is NEVER dropped by a folder row of the same name', async () => {
    const db = new FakeDb();
    db.skills = [{ id: IDS.skill, name: 'alpha', description: 'the graph one' }];
    const dto = SkillCatalogSchema.parse(
      await handler(db)(request('skills.catalog', { params: { spaceId: IDS.space } })),
    );
    const alphas = dto.entries.filter((entry) => entry.name === 'alpha');
    expect(alphas.map((entry) => entry.source).sort()).toEqual(['claude-code', 'tm8']);
  });

  it('refuses a non-member — the documented refusal, never a folder listing', async () => {
    const db = new FakeDb();
    db.members = [];
    await expect(handler(db)(request('skills.catalog', { params: { spaceId: IDS.space } })))
      .rejects.toMatchObject({ code: 'forbidden', message: 'not a member of this space' });
    // Nothing past the gate ran: no project read, no entity read.
    expect(db.seen.filter((sql) => /public\.projects|public\.entities/.test(sql))).toEqual([]);
  });

  it('refuses an unresolved identity rather than falling through to the node owner', async () => {
    const db = new FakeDb();
    await expect(
      readSkillCatalog(
        { query: (sql, params) => db.queryImpl(sql, params ?? []), rpc: async () => ({}) } as Querier,
        { nodeAdmin: false, requestId: 'req' } as DbClaims,
        { spaceId: IDS.space },
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('narrows to one linked project, and refuses a project that is not linked here', async () => {
    const db = new FakeDb();
    const dto = SkillCatalogSchema.parse(await handler(db)(request('skills.catalog', {
      params: { spaceId: IDS.space },
      query: `projectId=${IDS.project}`,
    })));
    expect(dto.projectId).toBe(IDS.project);

    await expect(handler(db)(request('skills.catalog', {
      params: { spaceId: IDS.space },
      query: `projectId=${IDS.other}`,
    }))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('answers the personal roots alone when the Space has no linked project', async () => {
    const db = new FakeDb();
    db.projects = [];
    const dto = SkillCatalogSchema.parse(
      await handler(db)(request('skills.catalog', { params: { spaceId: IDS.space } })),
    );
    expect(dto.roots.every((root) => root.startsWith(home))).toBe(true);
    expect(dto.entries.map((entry) => entry.name)).toEqual([
      'alpha', 'bundled', 'graph skill', 'home-codex', 'synced-one',
    ]);
  });

  it('rejects a malformed projectId as invalid input rather than sending it to SQL', async () => {
    await expect(handler(new FakeDb())(request('skills.catalog', {
      params: { spaceId: IDS.space },
      query: 'projectId=not-a-uuid',
    }))).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
