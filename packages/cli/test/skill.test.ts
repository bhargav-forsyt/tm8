/**
 * `tm8 skill list` — the CLI half of the skill catalog union.
 *
 * Driven through the REAL parser, context resolver and HTTP client against a
 * loopback node, the same shape `project.test.ts` uses and for the same reason:
 * `src/commands/registry.ts` is coordinator-owned, so everything except that
 * one wiring line stays under test.
 *
 * The laws asserted here:
 *
 *  - the path is bound with `bindPath('skills.catalog', …)`, so a URL literal
 *    that happens to be right today still fails the moment the catalog moves;
 *  - `--project` rides as a QUERY parameter and is absent when unset — an
 *    empty `?projectId=` is not "every project", it is a malformed uuid;
 *  - the human render is a function of the SAME DTO `--format json` prints,
 *    and it distinguishes the two reference forms, because pasting a folder
 *    row's id into a `tm8://skill/…` link produces a link to nothing;
 *  - `roots` is rendered even when it is empty. "No skills" and "no folder was
 *    opened" are different answers and only one of them is about frontmatter.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { bindPath, SkillCatalogSchema } from '@tm8/contract';
import { parseInvocation } from '../src/args.js';
import { resolveContext } from '../src/context.js';
import { errorLines, exitCodeFor } from '../src/errors.js';
import { createOutput } from '../src/output.js';
import { SKILL_COMMANDS } from '../src/commands/skill.js';
import { commandDiscovery, isCommandPath } from '../src/discovery/operations.js';

const SPACE = '00000000-0000-7000-8000-0000000000a1';
const PROJECT = '00000000-0000-7000-8000-0000000000b1';
const SKILL_ENTITY = '00000000-0000-7000-8000-0000000000c1';

interface Captured {
  method: string;
  path: string;
  query: string;
}

let server: Server;
let baseUrl: string;
let requests: Captured[] = [];
let respond: () => { status?: number; body?: unknown } = () => ({ body: {} });

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://tm8.invalid');
    requests.push({ method: req.method ?? '', path: url.pathname, query: url.search });
    const answer = respond();
    res.setHeader('content-type', 'application/json');
    res.setHeader('x-tm8-request-id', 'req_test');
    res.statusCode = answer.status ?? 200;
    res.end(
      res.statusCode >= 400
        ? JSON.stringify(answer.body)
        : JSON.stringify({ data: answer.body ?? {}, requestId: 'req_test' }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (typeof addr === 'string' || addr === null) throw new Error('no address');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

const CATALOG = {
  spaceId: SPACE,
  projectId: null,
  roots: ['/repo/.claude/skills', '/home/agent/.agents/skills'],
  entries: [
    {
      id: 'claude-code:project:pre-merge-verify',
      name: 'pre-merge-verify',
      description: 'Run the branch build on its own stack',
      source: 'claude-code',
      scope: 'project',
      path: '/repo/.claude/skills/pre-merge-verify/SKILL.md',
      argumentHint: '[pr-number]',
    },
    {
      id: SKILL_ENTITY,
      name: 'team review',
      description: 'How this team reviews',
      source: 'tm8',
      scope: 'space',
      entityId: SKILL_ENTITY,
    },
  ],
  truncated: false,
};

beforeEach(() => {
  requests = [];
  respond = () => ({ body: CATALOG });
});

interface Invocation {
  code: number;
  stdout: string;
  stderr: string;
}

async function invoke(argv: readonly string[], session: Record<string, string> = {}): Promise<Invocation> {
  const parsed = parseInvocation(argv);
  const mod = SKILL_COMMANDS.find((m) => m.path.every((seg, i) => parsed.positionals[i] === seg));
  if (!mod) throw new Error(`no skill module for ${parsed.positionals.join(' ')}`);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const out = createOutput({
    format: parsed.globals.format,
    quiet: parsed.globals.quiet,
    streams: {
      stdout: (c) => void stdout.push(typeof c === 'string' ? c : Buffer.from(c).toString('utf8')),
      stderr: (c) => void stderr.push(c),
    },
  });
  const ctx = resolveContext({ globals: parsed.globals, session: { baseUrl, ...session }, config: {} });
  let code: number;
  try {
    code = await mod.run({
      path: mod.path,
      args: parsed.positionals.slice(mod.path.length),
      options: parsed.options,
      passthrough: parsed.passthrough,
      ctx,
      out,
    });
  } catch (err) {
    out.error(errorLines(err));
    code = exitCodeFor(err);
  }
  return { code, stdout: stdout.join(''), stderr: stderr.join('') };
}

describe('the skill module registers exactly its projected path', () => {
  it('claims `skill list` and nothing else', () => {
    expect(SKILL_COMMANDS.map((c) => c.path.join(' '))).toEqual(['skill list']);
  });

  it('is documented in the grammar projection it is dispatched through', () => {
    expect(isCommandPath(['skill', 'list'])).toBe(true);
    expect(commandDiscovery(['skill', 'list'])?.operations).toEqual(['skills.catalog']);
  });
});

describe('tm8 skill list', () => {
  it('binds the catalog path from the Space and sends no project by default', async () => {
    const run = await invoke(['skill', 'list', '--space', SPACE, '--format', 'json']);
    expect(run.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe('GET');
    expect(requests[0]!.path).toBe(bindPath('skills.catalog', { spaceId: SPACE }));
    // NOT `?projectId=` — an empty value is a malformed uuid, not "all".
    expect(requests[0]!.query).toBe('');
    expect(SkillCatalogSchema.safeParse(JSON.parse(run.stdout)).success).toBe(true);
  });

  it('narrows with --project', async () => {
    await invoke(['skill', 'list', '--space', SPACE, '--project', PROJECT, '--format', 'json']);
    expect(new URLSearchParams(requests[0]!.query).get('projectId')).toBe(PROJECT);
  });

  it('refuses to run without a Space rather than guessing one', async () => {
    const run = await invoke(['skill', 'list']);
    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(/no Space in context/);
    expect(requests).toHaveLength(0);
  });

  it('refuses --mutation-id: a read has nothing to make idempotent', async () => {
    const run = await invoke(['skill', 'list', '--space', SPACE, '--mutation-id', 'x']);
    expect(run.code).toBe(2);
    expect(requests).toHaveLength(0);
  });

  it('refuses paging flags the contract does not bind, naming why', async () => {
    const run = await invoke(['skill', 'list', '--space', SPACE, '--limit', '10']);
    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(/--limit has no binding/);
    expect(requests).toHaveLength(0);
  });

  it('human render: names the origin and the reference form each row actually takes', async () => {
    const run = await invoke(['skill', 'list', '--space', SPACE]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('2 skill(s) across 2 folder root(s)');
    // A folder row commits as a bare `/name`; the entity row as a tm8 URI.
    expect(run.stdout).toContain('claude-code/project');
    expect(run.stdout).toContain('/pre-merge-verify');
    expect(run.stdout).toContain(`tm8://skill/${SKILL_ENTITY}`);
    expect(run.stdout).toContain('args: [pr-number]');
    expect(run.stdout).toContain('/repo/.claude/skills/pre-merge-verify/SKILL.md');
    // The roots are part of the answer, not decoration.
    expect(run.stdout).toContain('roots scanned');
    expect(run.stdout).toContain('/home/agent/.agents/skills');
  });

  it('human render: an empty catalog says so, and says whether anything was opened', async () => {
    respond = () => ({ body: { ...CATALOG, entries: [], roots: [] } });
    const run = await invoke(['skill', 'list', '--space', SPACE]);
    expect(run.stdout).toContain('0 skill(s) across 0 folder root(s)');
    expect(run.stdout).toContain('no skills');
    expect(run.stdout).toContain('none — no linked project has a skill folder');
  });

  it('human render: a truncated scan is stated, never absorbed', async () => {
    respond = () => ({ body: { ...CATALOG, truncated: true } });
    const run = await invoke(['skill', 'list', '--space', SPACE]);
    expect(run.stdout).toContain('TRUNCATED');
  });

  it('surfaces the node refusal rather than printing an empty catalog', async () => {
    respond = () => ({
      status: 403,
      body: { error: { code: 'forbidden', message: 'not a member of this space' }, requestId: 'req_test' },
    });
    const run = await invoke(['skill', 'list', '--space', SPACE]);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toMatch(/not a member of this space/);
    expect(run.stdout).toBe('');
  });
});
