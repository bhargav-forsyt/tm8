/**
 * `skills.catalog`'s registration seam.
 *
 * One operation, and it is a READ with no body: the space comes from the path,
 * the optional project narrowing from `?projectId=`, and every directory it
 * opens is derived from those two facts plus this process's own home. The
 * membership gate lives in the service (`readSkillCatalog`) rather than here,
 * because the same function is the seam a spawn-time materializer calls without
 * an HTTP request in sight, and a check only the handler makes is a check the
 * other caller can skip.
 */
import { CollabError, type SkillCatalog } from '@tm8/contract';

import { claimsFor, optionalUuid, requireUuidParam } from '../../context.js';
import type { FacadeDeps } from '../../deps.js';
import type { HandlerRegistry } from '../../registry.js';
import { readSkillCatalog } from '../../services/w2/skill-catalog.js';
import type { OperationHandler } from '../../../http/types.js';

export function skillsCatalog(deps: FacadeDeps): OperationHandler {
  return async (ctx): Promise<SkillCatalog> => {
    const owner = await deps.owner();
    const spaceId = requireUuidParam(ctx, 'spaceId');
    const projectId = optionalUuid(ctx.query.get('projectId'), 'projectId');
    const claims = claimsFor(owner, ctx);
    // `claimsFor` refuses an anonymous caller outright; this restates the same
    // rule for the identity it hands back, so an unresolved bearer can never
    // reach a filesystem scan under the node owner's claims.
    if (!claims.identityId) throw new CollabError('unauthenticated', 'authentication is required');
    return deps.db.tx(claims, (q) => readSkillCatalog(q, claims, { spaceId, projectId }));
  };
}

export function registerW2SkillsHandlers(registry: HandlerRegistry, deps: FacadeDeps): void {
  registry.registerAll({ 'skills.catalog': skillsCatalog(deps) });
}
