/**
 * The `/` trigger's subject (`skills.ts`): options come from the skill CATALOG
 * — the Space's skill entities unioned with the agent skill folders on the node
 * — and the committed reference is whichever durable form that row actually
 * has. A tm8 entity is a `tm8://skill/<id>` link, because the id survives a
 * rename; a folder skill is a bare `/name`, because that is the token the
 * agent's own harness resolves and there is no entity behind it to link to.
 *
 * The entity query stays as the fallback for a node too old to answer the
 * catalog, and it is a fallback rather than a supplement: the catalog already
 * CONTAINS the entity rows, so running both would double every one of them.
 */
import { describe, expect, it, vi } from 'vitest';
import { CollabError, type CollectionResult, type SkillCatalog } from '@tm8/contract';
import { loadSkillTriggerOptions, skillReference } from './skills';

const SPACE = '0192aaaa-0000-7000-8000-000000000001';
const ENTITY = '0192bbbb-0000-7000-8000-000000000002';
const PROJECT = '0192cccc-0000-7000-8000-000000000003';

function skillRow(id: string, title: string, description?: string) {
  return {
    id,
    title,
    state: { kind: 'skill', equipped: false, ...(description ? { description } : {}) },
  };
}

const CATALOG: SkillCatalog = {
  spaceId: SPACE as never,
  projectId: null,
  roots: ['/repo/.claude/skills'],
  entries: [
    {
      id: 'codex:personal:zeta',
      name: 'zeta',
      description: 'a personal codex skill',
      source: 'codex',
      scope: 'personal',
      path: '/home/agent/.agents/skills/zeta/SKILL.md',
    },
    {
      id: 'claude-code:project:alpha',
      name: 'alpha',
      description: 'a project skill',
      source: 'claude-code',
      scope: 'project',
      path: '/repo/.claude/skills/alpha/SKILL.md',
      argumentHint: '[pr]',
    },
    {
      id: ENTITY,
      name: 'team review',
      description: 'How this team reviews',
      source: 'tm8',
      scope: 'space',
      entityId: ENTITY as never,
    },
  ],
  truncated: false,
};

const refusedQuery = () => {
  throw new Error('the entity query must not run when the catalog answered');
};

describe('loadSkillTriggerOptions', () => {
  it('reads the catalog, labels each row with where it lives, and sorts by name', async () => {
    const skillCatalog = vi.fn().mockResolvedValue(CATALOG);

    const options = await loadSkillTriggerOptions({
      port: { query: refusedQuery as never, skillCatalog },
      spaceId: SPACE as never,
    });

    expect(skillCatalog).toHaveBeenCalledWith(SPACE, undefined);
    expect(options).toEqual([
      {
        id: 'claude-code:project:alpha',
        display: 'alpha',
        group: 'project · Claude Code',
        // `meta` is the DESCRIPTION ONLY — U1's ranker scores a meta word-start
        // tier, and a hint folded in here would make `[pr]` matchable text.
        meta: 'a project skill',
        argumentHint: '[pr]',
      },
      { id: ENTITY, display: 'team review', group: 'tm8', meta: 'How this team reviews' },
      {
        id: 'codex:personal:zeta',
        display: 'zeta',
        group: 'personal · Codex',
        meta: 'a personal codex skill',
      },
    ]);
  });

  it('passes a project narrowing through when one is given', async () => {
    const skillCatalog = vi.fn().mockResolvedValue({ ...CATALOG, entries: [] });
    await loadSkillTriggerOptions({
      port: { query: refusedQuery as never, skillCatalog },
      spaceId: SPACE as never,
      projectId: PROJECT as never,
    });
    expect(skillCatalog).toHaveBeenCalledWith(SPACE, PROJECT);
  });

  it('falls back to the entity query on an older node, and SAYS SO on every row', async () => {
    const query = vi.fn().mockResolvedValue({
      page: { items: [skillRow('s1', 'code review', 'How this team reviews')] },
    } as unknown as CollectionResult);

    for (const code of ['not_implemented', 'not_found'] as const) {
      query.mockClear();
      const options = await loadSkillTriggerOptions({
        port: {
          query,
          skillCatalog: () => Promise.reject(new CollabError(code, 'no such operation here')),
        },
        spaceId: SPACE as never,
      });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ spaceId: SPACE, kinds: ['skill'] }));
      expect(options).toEqual([
        { id: 's1', display: 'code review', group: 'tm8 · older server', meta: 'How this team reviews' },
      ]);
    }
  });

  it('a `not_found` WITH a project is the real refusal and is not swallowed', async () => {
    // Falling back here would answer "that project is not linked" with a
    // silently narrower picker, which reads as "your skills disappeared".
    await expect(loadSkillTriggerOptions({
      port: {
        query: refusedQuery as never,
        skillCatalog: () => Promise.reject(new CollabError('not_found', 'project is not linked to this space')),
      },
      spaceId: SPACE as never,
      projectId: PROJECT as never,
    })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does NOT fall back on a real failure — a partial list would report an outage as a catalog', async () => {
    await expect(loadSkillTriggerOptions({
      port: {
        query: refusedQuery as never,
        skillCatalog: () => Promise.reject(new CollabError('forbidden', 'not a member of this space')),
      },
      spaceId: SPACE as never,
    })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('uses the entity query outright when the seam has no catalog at all', async () => {
    const query = vi.fn().mockResolvedValue({
      page: { items: [skillRow('s2', 'ship checklist')] },
    } as unknown as CollectionResult);
    const options = await loadSkillTriggerOptions({ port: { query }, spaceId: SPACE as never });
    expect(options).toEqual([{ id: 's2', display: 'ship checklist', group: 'tm8 · older server' }]);
  });

  it('walks the cursor to exhaustion — one page is a silent cap on a large catalog', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ page: { items: [skillRow('s1', 'alpha')], nextCursor: 'page-2' } } as unknown as CollectionResult)
      .mockResolvedValueOnce({ page: { items: [skillRow('s2', 'beta')], nextCursor: null } } as unknown as CollectionResult);

    const options = await loadSkillTriggerOptions({ port: { query }, spaceId: SPACE as never });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]![0]).toMatchObject({ cursor: 'page-2' });
    expect(options.map((o) => o.display)).toEqual(['alpha', 'beta']);
  });
});

describe('skillReference', () => {
  it('is a markdown link for a tm8 entity: /name label, tm8://skill/<id> target, trailing separator', () => {
    expect(skillReference('code review', '0192bbbb-0000-7000-8000-000000000002'))
      .toBe('[/code review](tm8://skill/0192bbbb-0000-7000-8000-000000000002) ');
  });

  it('is a BARE token for a folder skill — the syntax the agent itself resolves', () => {
    expect(skillReference('pre-merge-verify', 'claude-code:project:pre-merge-verify'))
      .toBe('/pre-merge-verify ');
    expect(skillReference('zeta', 'codex:personal:zeta')).toBe('/zeta ');
  });

  it('escapes markdown label closers so the entity link survives odd names', () => {
    expect(skillReference('a]b', '0192bbbb-0000-7000-8000-000000000002'))
      .toBe('[/a\\]b](tm8://skill/0192bbbb-0000-7000-8000-000000000002) ');
  });

  it('never emits an empty label, in either form', () => {
    expect(skillReference('   ', '0192bbbb-0000-7000-8000-000000000002'))
      .toBe('[/skill](tm8://skill/0192bbbb-0000-7000-8000-000000000002) ');
    expect(skillReference('   ', 'claude-code:project:x')).toBe('/skill ');
  });
});
