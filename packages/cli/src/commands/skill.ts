/**
 * `tm8 skill list` — every skill reachable in a Space, from all four places one
 * can live: the Space's own `skill` entities, and the Claude Code and Codex
 * skill FOLDERS of its linked projects and of the node user's home.
 *
 * WHY THIS IS ONE COMMAND AND NOT A FAMILY. `skills.catalog` is a read and the
 * only operation in its family; creating, editing and equipping a skill ENTITY
 * are `entity create`/`entity patch`/`edge create` on the `skill` kind, and a
 * `skill create` here would be a second name for one of them. Folder skills
 * have no write door at all — they are files in somebody's checkout, and tm8
 * does not own them.
 *
 * THE HUMAN RENDER LEADS WITH THE REFERENCE FORM, because that is the actual
 * question a caller has: a tm8 row is written into a message as
 * `tm8://skill/<id>` and survives a rename; a folder row is written as the bare
 * `/name` the agent's own harness resolves. Printing both under one heading
 * without saying which is which would invite a caller to paste a folder row's
 * id into a link that resolves to nothing.
 *
 * `roots` is printed too, and it is not decoration: the useful thing to know
 * about a skill that is NOT in the list is whether its folder was opened at
 * all. A listing that cannot answer that sends people editing frontmatter to
 * fix a directory that was never scanned.
 */
import { requireSpace } from '../context.js';
import { CliError, EXIT_OK, EXIT_USAGE, type ExitCode } from '../exit.js';
import { refuseMutationId } from '../mutation.js';
import { clientFor, observedInvoke } from '../discovery/observe.js';
import type { CommandContext, CommandModule } from '../run.js';

interface SkillRow {
  id?: string;
  name?: string;
  description?: string;
  source?: string;
  scope?: string;
  path?: string;
  entityId?: string;
  argumentHint?: string;
}

interface CatalogDto {
  spaceId?: string;
  projectId?: string | null;
  roots?: string[];
  entries?: SkillRow[];
  truncated?: boolean;
}

/**
 * The catalog answers one whole listing — the folder half is a directory scan,
 * not a keyset over a table — so the contract binds no cursor to it. Accepting
 * `--limit`/`--cursor` and dropping them would let a caller believe they paged.
 */
function refuseUnboundPaging(cmd: CommandContext): void {
  for (const flag of ['limit', 'cursor'] as const) {
    if (cmd.options.has(flag)) {
      throw new CliError(
        `--${flag} has no binding on \`tm8 skill list\`: the contract defines no paging for ` +
          'skills.catalog, which answers the complete catalog in one response',
        EXIT_USAGE,
        { hint: 'narrow it with --project <project-resource-id> instead' },
      );
    }
  }
}

async function skillList(cmd: CommandContext): Promise<ExitCode> {
  refuseMutationId('skill list', cmd.options.value('mutation-id'));
  refuseUnboundPaging(cmd);
  const spaceId = requireSpace(cmd.ctx);
  const projectId = cmd.options.value('project');

  const data = await observedInvoke<unknown>(clientFor(cmd.ctx), 'skills.catalog', {
    params: { spaceId },
    query: { projectId },
  });
  cmd.out.data(data, renderCatalog);
  return EXIT_OK;
}

/** `[/name](tm8://skill/<id>)` for an entity, a bare `/name` for a folder. */
function referenceOf(row: SkillRow): string {
  return row.entityId ? `tm8://skill/${row.entityId}` : `/${String(row.name ?? '')}`;
}

function renderCatalog(dto: unknown): string {
  const catalog = (dto ?? {}) as CatalogDto;
  const entries = catalog.entries ?? [];
  const roots = catalog.roots ?? [];

  const lines: string[] = [];
  const scope = catalog.projectId ? ` (project ${catalog.projectId})` : '';
  lines.push(
    `${String(entries.length)} skill(s) across ${String(roots.length)} folder root(s)${scope}` +
      (catalog.truncated ? '  [TRUNCATED: a root hit its entry ceiling]' : ''),
  );

  if (entries.length === 0) {
    lines.push('  no skills — neither this Space nor the scanned folders hold one');
  }
  const width = Math.max(0, ...entries.map((row) => (row.name ?? '').length));
  for (const row of entries) {
    const name = (row.name ?? '?').padEnd(width);
    const origin = `${String(row.source ?? '?')}/${String(row.scope ?? '?')}`;
    lines.push(`  ${name}  ${origin.padEnd(20)}  ${referenceOf(row)}`);
    const detail = [
      row.argumentHint ? `args: ${row.argumentHint}` : '',
      row.description ? row.description : '',
    ].filter(Boolean).join('  —  ');
    if (detail) lines.push(`  ${' '.repeat(width)}  ${detail}`);
    if (row.path) lines.push(`  ${' '.repeat(width)}  ${row.path}`);
  }

  lines.push('', 'roots scanned');
  if (roots.length === 0) lines.push('  none — no linked project has a skill folder and this node user has none');
  for (const root of roots) lines.push(`  ${root}`);
  return lines.join('\n');
}

export const SKILL_COMMANDS: CommandModule[] = [
  { path: ['skill', 'list'], run: skillList },
];
