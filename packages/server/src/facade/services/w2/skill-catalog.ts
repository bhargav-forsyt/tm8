/**
 * THE SKILL CATALOG — one answer to "what skills exist here", assembled from
 * the four places a skill can actually live.
 *
 * A Space's own `skill` entities are only ever part of the picture. The agents
 * this node launches — Claude Code, Codex — load skills from FOLDERS on disk,
 * and those folders are the ones a human is really asking about when they type
 * `/` in the composer. A picker that showed the graph half alone would say "no
 * matching skills" about 100 skills sitting in the checkout it is looking at.
 *
 * WHY THE FOLDER HALF IS SAFE TO READ HERE, stated once:
 *
 *  - the roots are DERIVED, never supplied. A project root comes from
 *    `projects.working_dir` (the same rule `projects.branches.list` states: the
 *    path comes from the row, never from the request), and the personal roots
 *    come from this process's own home. There is no caller-controlled path in
 *    this file, so there is no arbitrary-directory read wearing a space id.
 *  - authorization is the Space's. `readSkillCatalog` checks membership itself
 *    rather than trusting its caller to have done it, because its second caller
 *    is a spawn-time materializer that never sees an HTTP request.
 *  - it is bounded three ways: a per-root entry ceiling, a per-file byte
 *    ceiling on the frontmatter read, and NO RECURSION — every layout below is
 *    a fixed depth, so a symlink cycle has nothing to spin on.
 *  - a symlinked ENTRY inside a root is skipped, exactly as
 *    `listProjectDirectories` skips one, so a skill folder cannot be a door out
 *    of its root. A symlinked ROOT is resolved and deduped instead: `.agents`
 *    pointing at `.claude` is one catalog, and dropping the second root is what
 *    makes 45 skills list 45 times rather than 90.
 */
import { open, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  CollabError,
  type SkillCatalog,
  type SkillCatalogEntry,
  type SkillCatalogScope,
  type SkillCatalogSource,
} from '@tm8/contract';

import type { DbClaims, Querier } from '../../../db/types.js';

/**
 * A picker stays responsive, and one pathological directory cannot become the
 * whole answer. Hit by a root, it sets `truncated` on the listing rather than
 * being absorbed silently.
 */
export const MAX_SKILLS_PER_ROOT = 200;

/** `skill` ENTITIES are graph rows, and the Space's own list is small. */
export const MAX_SKILL_ENTITIES = 500;

/** Frontmatter lives at the top of the file; the body is never read. */
const FRONTMATTER_BYTES = 8 * 1024;

/** How far up from a working directory a project root is looked for. */
const MAX_PROJECT_ROOT_DEPTH = 40;

/**
 * The marker that says "this is the top of the project" — `.git`, and
 * deliberately ONLY `.git`.
 *
 * Codex walks `.agents/skills` from the project root down to the working
 * directory, so the root has to be identified before the walk can start. It is
 * tempting to accept `.codex` or `.agents` as markers too; that is wrong in the
 * exact case the walk exists for. A monorepo package that carries its own
 * `.agents/skills` would then be its OWN root, the walk would be one directory
 * long, and the repo-wide set the package is supposed to inherit would vanish —
 * the marker would be satisfied by the very thing it is meant to look past.
 *
 * `.git` matches a file as well as a directory, so a git WORKTREE (whose `.git`
 * is a file pointing at the real one) is a project root like any other.
 * Nothing found ⇒ the working directory IS the root, which makes the walk one
 * directory long rather than a walk to `/`.
 */
const PROJECT_ROOT_MARKERS = ['.git'] as const;

/**
 * How the names in a root are laid out.
 *
 *  - `skill-dir`    `<root>/<name>/SKILL.md` — every modern skill root.
 *  - `command-file` `<root>/<name>.md` — Claude Code's legacy `commands/`.
 *
 * Both are ONE level deep, and that is load-bearing: with no recursion there
 * is no cycle to guard against and no accidental walk into a checkout.
 */
type SkillRootLayout = 'skill-dir' | 'command-file';

export interface SkillRoot {
  path: string;
  source: SkillCatalogSource;
  scope: SkillCatalogScope;
  layout: SkillRootLayout;
}

/**
 * Scope precedence, lowest number wins a name collision — Claude Code's own
 * order (enterprise › personal › project › plugin › bundled) read onto this
 * vocabulary, with `plugin` absent because it is a SOURCE here and no v1 root
 * produces one.
 *
 * `space` is ranked but unreachable: tm8 entity rows are keyed apart from
 * folder rows and never enter this comparison, because the two are REFERENCED
 * differently (`tm8://skill/<id>` versus a bare `/name`) and both stay usable.
 * Its number exists so the record is total over the vocabulary rather than
 * over the cases this file happens to reach.
 */
const SCOPE_RANK: Record<SkillCatalogScope, number> = {
  admin: 0,
  personal: 1,
  project: 2,
  system: 3,
  space: 4,
};

/**
 * Claude Code compares skill names case-, space- and dash-insensitively, so
 * `Code Review`, `code-review` and `code_review` are ONE name competing for one
 * `/` token. Deduping on the raw string instead would offer a picker three rows
 * that all resolve to whichever the harness happens to pick.
 */
export function normalizeSkillName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_]+/g, '');
}

/**
 * Deterministic, and deliberately NOT `localeCompare`: the server sorts once
 * for every client, and a collation that varies with the node's locale would
 * make the same catalog answer in two different orders. Name first, id as the
 * tie-break so the order is total.
 */
function byNameThenId(a: SkillCatalogEntry, b: SkillCatalogEntry): number {
  const an = a.name.toLowerCase();
  const bn = b.name.toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The nearest ancestor of `workingDir` carrying a project marker, or
 * `workingDir` itself. Pure path walking plus one `stat` per level — it never
 * reads a directory's contents.
 */
export async function findProjectRoot(workingDir: string): Promise<string> {
  let current = workingDir;
  for (let depth = 0; depth < MAX_PROJECT_ROOT_DEPTH; depth += 1) {
    for (const marker of PROJECT_ROOT_MARKERS) {
      try {
        await stat(join(current, marker));
        return current;
      } catch {
        // Absent or unreadable: not a marker. Keep walking.
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return workingDir;
}

/**
 * Every root one linked project contributes, in precedence order.
 *
 * The `.agents/skills` entries are a WALK, not a single directory: Codex reads
 * one at every level from the project root down to the directory it was
 * launched in, so a monorepo package can carry its own set. The walk is
 * top-down because that is the order a later name-collision tie-break reads.
 */
export async function projectSkillRoots(workingDir: string): Promise<SkillRoot[]> {
  const projectRoot = await findProjectRoot(workingDir);

  const chain: string[] = [];
  let current = workingDir;
  for (let depth = 0; depth < MAX_PROJECT_ROOT_DEPTH; depth += 1) {
    chain.unshift(current);
    if (current === projectRoot) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return [
    { path: join(workingDir, '.claude', 'skills'), source: 'claude-code', scope: 'project', layout: 'skill-dir' },
    { path: join(workingDir, '.claude', 'commands'), source: 'claude-code', scope: 'project', layout: 'command-file' },
    { path: join(workingDir, '.codex', 'skills'), source: 'codex', scope: 'project', layout: 'skill-dir' },
    ...chain.map((dir): SkillRoot => ({
      path: join(dir, '.agents', 'skills'),
      source: 'codex',
      scope: 'project',
      layout: 'skill-dir',
    })),
  ];
}

/**
 * The node user's own roots.
 *
 * `~/.claude/skills/synced` is listed SEPARATELY from `~/.claude/skills` even
 * though it sits inside it. It has to be: the scan is one level deep, so from
 * the parent's point of view `synced` is a directory with no `SKILL.md` — a row
 * that gets skipped, taking every synced skill with it.
 */
export function homeSkillRoots(home: string = homedir()): SkillRoot[] {
  return [
    { path: join(home, '.claude', 'skills'), source: 'claude-code', scope: 'personal', layout: 'skill-dir' },
    { path: join(home, '.claude', 'skills', 'synced'), source: 'claude-code', scope: 'personal', layout: 'skill-dir' },
    { path: join(home, '.claude', 'commands'), source: 'claude-code', scope: 'personal', layout: 'command-file' },
    { path: join(home, '.agents', 'skills'), source: 'codex', scope: 'personal', layout: 'skill-dir' },
    { path: join(home, '.codex', 'skills'), source: 'codex', scope: 'personal', layout: 'skill-dir' },
    { path: join(home, '.codex', 'skills', '.system'), source: 'codex', scope: 'system', layout: 'skill-dir' },
  ];
}

interface Frontmatter {
  name?: string;
  description?: string;
  argumentHint?: string;
}

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value.endsWith(first)) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * The three frontmatter keys this catalog needs, and nothing else.
 *
 * A YAML dependency is not earned by three scalars, but the FOLDED form is:
 * real skills write `description: >-` with the text on the following indented
 * lines, and a parser that only understood `key: value` would report every one
 * of them as having no description. Block scalars are folded to a single line
 * because a picker row is a single line.
 */
export function parseSkillFrontmatter(text: string): Frontmatter {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};

  const fields: Record<string, string> = {};
  let index = 1;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trim() === '---' || line.trim() === '...') break;
    index += 1;

    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s?(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const inline = match[2] ?? '';

    if (/^[|>][+-]?\s*$/.test(inline.trim())) {
      const block: string[] = [];
      while (index < lines.length) {
        const next = lines[index]!;
        if (next.trim() === '---' || next.trim() === '...') break;
        if (next.trim() !== '' && !/^\s/.test(next)) break;
        block.push(next.trim());
        index += 1;
      }
      fields[key] = block.join(' ').replace(/\s+/g, ' ').trim();
      continue;
    }
    fields[key] = unquote(inline);
  }

  return {
    ...(fields.name ? { name: fields.name } : {}),
    ...(fields.description ? { description: fields.description } : {}),
    ...(fields['argument-hint'] ? { argumentHint: fields['argument-hint'] } : {}),
  };
}

/**
 * The head of one file, capped. `readFile` would pull a 200 KB skill body into
 * memory to read six lines of it, once per skill, on every keystroke-adjacent
 * picker load.
 */
async function readHead(path: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.allocUnsafe(FRONTMATTER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, FRONTMATTER_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

interface ScannedEntry extends SkillCatalogEntry {
  /** The canonical path of the file the row was read from — the first dedupe key. */
  realPath: string;
}

async function readSkillFile(
  root: SkillRoot,
  filePath: string,
  fallbackName: string,
): Promise<ScannedEntry | null> {
  const text = await readHead(filePath);
  if (text === null) return null;
  let realPath: string;
  try {
    realPath = await realpath(filePath);
  } catch {
    return null;
  }

  const front = parseSkillFrontmatter(text);
  // A missing `name` is NOT a reason to drop the skill: the harness itself
  // addresses a skill by its directory, and frontmatter that merely repeats it
  // is a convention, not a requirement.
  const name = front.name?.trim() || fallbackName;
  if (!name) return null;

  return {
    id: `${root.source}:${root.scope}:${name}`,
    name,
    description: front.description ?? '',
    source: root.source,
    scope: root.scope,
    path: filePath,
    ...(front.argumentHint ? { argumentHint: front.argumentHint } : {}),
    realPath,
  };
}

/**
 * One root, one level deep. Every failure here is a fact about the node's disk
 * — an absent folder, an unreadable one, a directory that is not a skill — and
 * none of them is a reason to fail the read: the answer is the union of what
 * COULD be opened, and a catalog that 500s because one home directory is not
 * there would be useless on every node but the author's.
 */
async function scanRoot(root: SkillRoot): Promise<{ entries: ScannedEntry[]; truncated: boolean }> {
  let dirents;
  try {
    dirents = await readdir(root.path, { withFileTypes: true });
  } catch {
    return { entries: [], truncated: false };
  }

  const candidates = dirents
    .filter((entry) => (root.layout === 'skill-dir'
      // `isDirectory()` is false for a symlink, which is the containment rule:
      // a skill folder must not be a door out of its root.
      ? entry.isDirectory() && !entry.name.startsWith('.')
      : entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')))
    .map((entry) => entry.name)
    .sort();

  const truncated = candidates.length > MAX_SKILLS_PER_ROOT;
  const entries: ScannedEntry[] = [];
  for (const name of candidates.slice(0, MAX_SKILLS_PER_ROOT)) {
    const [filePath, fallbackName] = root.layout === 'skill-dir'
      ? [join(root.path, name, 'SKILL.md'), name]
      : [join(root.path, name), name.slice(0, -'.md'.length)];
    const entry = await readSkillFile(root, filePath, fallbackName);
    if (entry) entries.push(entry);
  }
  return { entries, truncated };
}

/**
 * Canonicalize and dedupe the roots BEFORE opening any of them.
 *
 * This is the step that makes `.agents/skills → ../.claude/skills` behave: two
 * declared roots, one directory, and scanning both would list every skill twice
 * under two different sources. A root that does not resolve is dropped here
 * rather than failing later — it simply does not exist on this node.
 */
async function canonicalizeRoots(roots: readonly SkillRoot[]): Promise<SkillRoot[]> {
  const seen = new Set<string>();
  const resolved: SkillRoot[] = [];
  for (const root of roots) {
    let canonical: string;
    try {
      canonical = await realpath(root.path);
      if (!(await stat(canonical)).isDirectory()) continue;
    } catch {
      continue;
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    resolved.push({ ...root, path: canonical });
  }
  return resolved;
}

export interface FolderScanResult {
  roots: string[];
  entries: SkillCatalogEntry[];
  truncated: boolean;
}

/**
 * Scan a root list and reduce it to one row per skill.
 *
 * TWO DEDUPES, in this order, because they answer different questions:
 *
 *  1. REAL PATH — "is this the same file?". Survives symlinks that
 *     `canonicalizeRoots` could not collapse (a symlinked skill INSIDE a real
 *     root, a root nested in another root). First occurrence wins, so the
 *     earlier root's source label is the one that ships.
 *  2. NORMALIZED NAME — "is this the same `/token`?". Only one row can win a
 *     name, and precedence decides which, because that is the row the harness
 *     itself will resolve when a human types it. Ties inside one scope go to
 *     root order, which is why `projectSkillRoots` is ordered rather than a set.
 */
export async function scanSkillRoots(roots: readonly SkillRoot[]): Promise<FolderScanResult> {
  const canonical = await canonicalizeRoots(roots);

  const byRealPath = new Map<string, ScannedEntry>();
  let truncated = false;
  for (const root of canonical) {
    const result = await scanRoot(root);
    truncated = truncated || result.truncated;
    for (const entry of result.entries) {
      if (!byRealPath.has(entry.realPath)) byRealPath.set(entry.realPath, entry);
    }
  }

  const byName = new Map<string, ScannedEntry>();
  for (const entry of byRealPath.values()) {
    const key = normalizeSkillName(entry.name);
    const held = byName.get(key);
    if (!held || SCOPE_RANK[entry.scope] < SCOPE_RANK[held.scope]) byName.set(key, entry);
  }

  const entries = [...byName.values()]
    .map(({ realPath: _realPath, ...entry }) => entry)
    .sort(byNameThenId);

  return { roots: canonical.map((root) => root.path), entries, truncated };
}

interface SkillEntityRow {
  id: string;
  name: string;
  description: string;
}

interface ProjectRow {
  id: string;
  working_dir: string;
}

/**
 * The Space's own `skill` entities. RLS filters them, so a caller who cannot
 * see a restricted skill simply does not get its row — the same answer every
 * other entity read gives.
 */
async function readSkillEntities(q: Querier, spaceId: string): Promise<SkillCatalogEntry[]> {
  const rows = await q.query<SkillEntityRow>(
    `select e.id,
            coalesce(nullif(btrim(detail.name), ''), '(unnamed skill)') as name,
            coalesce(detail.description, '') as description
       from public.entities e
       join public.skills detail on detail.entity_id = e.id
      where e.space_id = $1 and e.kind = 'skill' and e.deleted_at is null
      order by detail.name asc, e.id asc
      limit ${String(MAX_SKILL_ENTITIES)}`,
    [spaceId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    source: 'tm8' as const,
    scope: 'space' as const,
    entityId: row.id,
  }));
}

/**
 * The membership gate, stated here rather than left to the handler.
 *
 * This function has two callers — the HTTP handler and (per the U7 split) a
 * spawn-time materializer that never sees a request — and the folder half of
 * its answer describes the node's disk. An authorization check a second caller
 * can forget to make is not a check; a missing identity must reach the
 * documented refusal, never a fabricated one.
 */
async function requireSpaceMember(q: Querier, spaceId: string, claims: DbClaims): Promise<void> {
  const identityId = claims.identityId;
  if (!identityId) throw new CollabError('unauthenticated', 'authentication is required');
  const rows = await q.query<{ entity_id: string }>(
    `select membership.entity_id
       from public.members membership
      where membership.space_id = $1 and membership.identity_id = $2`,
    [spaceId, identityId],
  );
  if (!rows[0]) throw new CollabError('forbidden', 'not a member of this space');
}

export interface SkillCatalogInput {
  spaceId: string;
  /** Narrows the folder half to ONE linked project; null scans every one. */
  projectId?: string | null;
  /** Test seam. Production always reads this process's own home. */
  home?: string;
}

/**
 * THE WHOLE ANSWER, and the seam U7 calls without going through HTTP.
 *
 * It takes a `Querier` so it rides its caller's transaction: a spawn manifest
 * that materializes the catalog alongside the persona it is describing must
 * read both at ONE instant, and a second connection would let a skill land
 * between them.
 */
export async function readSkillCatalog(
  q: Querier,
  claims: DbClaims,
  input: SkillCatalogInput,
): Promise<SkillCatalog> {
  await requireSpaceMember(q, input.spaceId, claims);

  const projectId = input.projectId ?? null;
  const projects = await q.query<ProjectRow>(
    `select p.id, p.working_dir
       from public.projects p
       join public.space_projects link
         on link.project_id = p.id and link.space_id = $1
      where $2::uuid is null or p.id = $2::uuid
      order by p.name asc, p.id asc`,
    [input.spaceId, projectId],
  );
  if (projectId !== null && projects.length === 0) {
    // Not-linked and not-found are the SAME answer, for the reason the spawn
    // path already gives: distinguishing them leaks the existence of projects
    // in spaces the caller is not a member of.
    throw new CollabError('not_found', `project ${projectId} is not linked to this space`);
  }

  const roots: SkillRoot[] = [];
  for (const project of projects) roots.push(...await projectSkillRoots(project.working_dir));
  roots.push(...homeSkillRoots(input.home));

  const [entities, folders] = await Promise.all([
    readSkillEntities(q, input.spaceId),
    scanSkillRoots(roots),
  ]);

  return {
    spaceId: input.spaceId,
    projectId,
    roots: folders.roots,
    entries: [...entities, ...folders.entries].sort(byNameThenId),
    truncated: folders.truncated,
  };
}
