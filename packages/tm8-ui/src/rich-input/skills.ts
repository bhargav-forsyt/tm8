/**
 * THE `/` TRIGGER'S SUBJECT — skills, loaded and referenced.
 *
 * THIS IS THE ONE FILE IN THE LANE THAT NAMES A KIND, and the lane guard says
 * so by name. The primitive (`useRichInput`, `triggers.ts`) knows no kinds —
 * that is its whole design, the same law `InlineTitleEditor` states for
 * titles. But the skill trigger IS about one kind: it queries skills and
 * writes skill references, and there is no structural discriminator to reach
 * for — the registry's skill row is field-for-field identical to the spell
 * row (same blocks, same `equipped` tint), so a "structural" lookup would be
 * a kind literal wearing a costume. Named plainly instead, in one file, with
 * the guard watching that it stays the only one.
 *
 * R1 GOVERNS THE SEMANTICS: a committed `/` REFERENCES a skill; it does not
 * invoke it. TWO reference forms exist, because there are two kinds of skill
 * and only one of them is a graph row:
 *
 *     [/skill-name](tm8://skill/<entityId>)   a tm8 `skill` ENTITY
 *     /skill-name                             a skill FOLDER on the node
 *
 * The entity form is a markdown link in the body — the body is the ONE channel
 * that reaches an agent verbatim on both delivery paths (the PTY envelope and
 * chat-home's prompt both carry body and routing facts only; `mentionIds`/
 * `attachmentIds` are never rendered into agent context). Message bodies are
 * already markdown end-to-end and `kit/Markdown` already resolves `tm8://`
 * link targets, so the same convention as `tm8://file/<id>` applies: the label
 * is what the human reads, the id is what survives a rename.
 *
 * The folder form is a BARE TOKEN, and wrapping it in a `tm8://skill/…` link
 * would be a lie twice over: there is no entity at that id to resolve, and the
 * agent already knows how to resolve `/name` — it reads the very same
 * `.claude/skills` and `.agents/skills` folders the catalog scanned. The plain
 * token is Claude Code's own syntax; writing anything else would take a
 * working reference and make it inert.
 */
import type {
  CollectionQuery,
  CollectionResult,
  ProjectId,
  SkillCatalog,
  SkillCatalogEntry,
  SpaceId,
} from '@tm8/contract';
import { isCollabError } from '@tm8/contract';
import type { TriggerOption } from './triggers';

export interface SkillTriggerOption extends TriggerOption {
  id: string;
  /** The skill's name — what `/query` prefix-matches against. */
  display: string;
  /** `state.description`, when the projection carries one. */
  meta?: string;
  /** WHERE IT LIVES — "project · Claude Code", "personal · Codex", "tm8". */
  group?: string;
}

interface SkillReadPort {
  query(input: CollectionQuery): Promise<CollectionResult>;
  /**
   * The catalog read, when this seam has one. Absent ⇒ the entity query is the
   * whole answer, exactly as it was before the catalog existed. Named exactly
   * as `Seam.skillCatalog` so the seam ITSELF satisfies this port — the gate
   * passes `port: seam` whole, and a renamed method here would force an adapter
   * object whose only job is spelling.
   */
  skillCatalog?(spaceId: SpaceId, projectId?: ProjectId): Promise<SkillCatalog>;
}

/** Short, human-first source labels — the picker has one line for this. */
const SOURCE_LABEL = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'claude-plugin': 'plugin',
  tm8: 'tm8',
} as const;

/**
 * "tm8" for a graph row; "project · Claude Code" for a folder row.
 *
 * The scope word is the CONTRACT VALUE itself, not a lookup table onto one.
 * A table would have to spell each scope as a string literal here, and the
 * lane guard (`no-kind-literals.test.ts`) reads every quoted entity-kind word
 * in this file as a kind reference — `'project'` is one. The carve this file
 * holds is for the skill kind alone, so the label is read off the row.
 */
function groupOf(entry: SkillCatalogEntry): string {
  if (entry.source === 'tm8') return 'tm8';
  return `${entry.scope} · ${SOURCE_LABEL[entry.source]}`;
}

/**
 * The one fallback label, and it is deliberately not silent.
 *
 * A node that predates `skills.catalog` answers `not_implemented`, and the
 * picker then shows the Space's skill entities alone — a TRUE list, but a
 * partial one, and the missing half is the half most people have. Saying so on
 * the row is the only place a reader is actually looking when they wonder
 * where their `.claude/skills` went.
 */
const FALLBACK_GROUP = 'tm8 · older server';

const MAX_SKILLS = 500;

/**
 * Every skill in the space, alphabetical. Deliberately NOT filtered to
 * equipped: R1 references, it does not dispatch, and referencing a skill the
 * reading agent has not equipped is exactly the case the reference exists
 * for — the agent can read it and decide.
 *
 * The catalog is preferred and the entity query is the fallback, never the
 * other way round: the catalog is a SUPERSET (its `tm8` rows are the same
 * entities) so running both would double every graph skill.
 */
export async function loadSkillTriggerOptions({
  port,
  spaceId,
  projectId,
}: {
  port: SkillReadPort;
  spaceId: SpaceId;
  projectId?: ProjectId;
}): Promise<SkillTriggerOption[]> {
  if (port.skillCatalog) {
    try {
      const catalog = await port.skillCatalog(spaceId, projectId);
      return catalog.entries.map(fromCatalogEntry).sort(byDisplay);
    } catch (error) {
      // ONLY "this node does not have that operation" falls back. Any other
      // failure — forbidden, a dead connection — is a failure to MEASURE, and a
      // caller that answered it with a partial list would be reporting a
      // smaller catalog as though it had counted one.
      //
      // TWO codes mean that one thing, for the same reason `Seam.menu` folds
      // the same pair: a node that HAS the catalog row but no handler answers
      // an honest 501, and a node too old to know the row at all has no route
      // to match and answers 404. `not_found` is only read that way when the
      // caller named no project — with a `projectId` it is the server's real
      // answer to "that project is not linked here", and swallowing it would
      // turn a wrong id into a silently narrower picker.
      if (!isCollabError(error)) throw error;
      const unavailable = error.code === 'not_implemented'
        || (error.code === 'not_found' && projectId === undefined);
      if (!unavailable) throw error;
    }
  }
  return (await loadSkillEntities(port, spaceId)).sort(byDisplay);
}

function byDisplay(a: SkillTriggerOption, b: SkillTriggerOption): number {
  return a.display.localeCompare(b.display);
}

function fromCatalogEntry(entry: SkillCatalogEntry): SkillTriggerOption {
  const meta = [entry.argumentHint, entry.description].filter(Boolean).join('  ');
  return {
    id: entry.id,
    display: entry.name,
    group: groupOf(entry),
    ...(meta ? { meta } : {}),
  };
}

/**
 * The pre-catalog read, kept whole as the fallback.
 *
 * PAGED TO EXHAUSTION, not one page. A single page of 100 silently
 * truncates a larger catalog, and the picker then says "No matching
 * skills" about a skill that exists — a lie the prefix filter turns into
 * a bug report. Skills are small rows and real spaces hold few, so the
 * loop almost never runs twice; the ceiling below is a runaway guard, and
 * hitting it drops the OLDEST-activity tail (the sort makes that choice
 * rather than leaving it to row order).
 */
async function loadSkillEntities(
  port: SkillReadPort,
  spaceId: SpaceId,
): Promise<SkillTriggerOption[]> {
  const items = [];
  let cursor: CollectionQuery['cursor'];
  do {
    const result = await port.query({
      spaceId,
      kinds: ['skill'],
      sort: 'activityAt_desc',
      limit: 100,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    items.push(...result.page.items);
    cursor = result.page.nextCursor ?? undefined;
  } while (cursor !== undefined && items.length < MAX_SKILLS);
  return items.map<SkillTriggerOption>((entity) => {
    const description = entity.state.kind === 'skill' ? entity.state.description : undefined;
    return {
      id: entity.id,
      display: entity.title,
      group: FALLBACK_GROUP,
      ...(description ? { meta: description } : {}),
    };
  });
}

/**
 * `]` closes a markdown label early — backslash-escaping is CommonMark's own
 * answer. Same rule as the doc editor's file references.
 */
function escapeLabel(name: string): string {
  return name.replace(/([[\]\\])/g, '\\$1');
}

/**
 * WHICH FORM TO WRITE, decided from the id's SHAPE.
 *
 * A folder row's id is the namespace this catalog mints: `<source>:<scope>:
 * <name>`. A tm8 entity id is an entity id and carries no colon. So a colon is
 * the discriminator, and it is one this lane OWNS rather than one it hopes
 * holds — the alternative, testing for a uuid, would quietly reclassify every
 * entity row on any node whose ids are not uuid-shaped, and the failure would
 * be a reference that silently resolves to nothing.
 *
 * DECIDED FROM THE ID, not from a second argument: all three call sites pass
 * `skillReference(option.display, option.id)`, and adding a parameter to each
 * would put one decision in three places for one of them to get wrong.
 */
function isFolderSkillId(skillId: string): boolean {
  return skillId.includes(':');
}

/** The committed text for a selected skill, trailing separator included. */
export function skillReference(name: string, skillId: string): string {
  const label = escapeLabel(name.trim() === '' ? 'skill' : name.trim());
  if (isFolderSkillId(skillId)) {
    // A FOLDER skill. The agent resolves `/name` out of the same directories
    // the catalog scanned, so the bare token IS the working reference; there is
    // no entity behind it for a `tm8://skill/…` link to point at.
    return `/${label} `;
  }
  return `[/${label}](tm8://skill/${encodeURIComponent(skillId)}) `;
}
