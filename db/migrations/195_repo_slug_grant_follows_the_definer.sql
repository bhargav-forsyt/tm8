-- 195 — the repo-slug grant follows the DEFINER, not the caller (2026-09-21).
--
-- `tracking.forge-watcher` has been failing on EVERY tick since 148 shipped
-- with `permission denied for function repo_slug_from_url`. Measured on a
-- prod node 2026-09-21: 3,598 consecutive failures before a restart, and the
-- counter resumed climbing immediately after. CI status, merge-conflict and
-- review loops are the things that watcher closes, so all three have been
-- silently dead for the whole of that window — the job logs and retries, it
-- never surfaces, and nothing else reads those facts.
--
-- WHERE 148 WENT WRONG, IN ITS OWN WORDS. The grant it wrote is:
--
--     grant execute on function internal.repo_slug_from_url(text) to tm8_app;
--
-- carrying the comment "tm8_app needs it because `pr_owning_session` is
-- STABLE, not SECURITY DEFINER — the nested call runs as whoever called the
-- outer function." Every clause of that is true, and the conclusion still does
-- not follow: it reasons one frame too shallow. The call chain is
--
--     public.observer_watch_targets   SECURITY DEFINER, owner tm8_graph_owner
--       └─ internal.pr_owning_session     plain, so it inherits the frame
--            └─ internal.repo_slug_from_url
--
-- `observer_watch_targets` is the door the watcher actually knocks on, and it
-- IS a definer function. So "whoever called the outer function" is not the
-- connecting role at all — the moment execution crosses that door it is
-- `tm8_graph_owner`, and stays `tm8_graph_owner` all the way down. `tm8_app`
-- was handed a privilege it can never reach the function to use, and the role
-- that does reach it was never granted anything.
--
-- Verified on the prod node before writing this file:
--     set role tm8_graph_owner; select internal.repo_slug_from_url('…');
--       → ERROR: permission denied for function repo_slug_from_url
--     set role tm8_app;         select internal.repo_slug_from_url('…');
--       → 'a/b'
--
-- WHY THE TESTS DID NOT CATCH IT. Every test that exercises the slug logic
-- calls `internal.repo_slug_from_url` directly, as `tm8` or `tm8_app` — both
-- of which are already granted. Reaching the defect requires entering through
-- `observer_watch_targets`, which is the one path no test takes, because the
-- watcher is a scheduler job rather than a request handler. The VERIFY block
-- below closes that gap by asserting the privilege from the definer's seat.
--
-- WHY A GRANT AND NOT `SECURITY DEFINER` ON THE INNER FUNCTION. Making
-- `repo_slug_from_url` a definer would work and would be wrong: it is pure
-- string arithmetic over its argument, touches no table and reads no
-- catalogue, so it has nothing to define away. A definer marker there would
-- assert a privilege boundary that does not exist and would have to be
-- re-justified by every reader. The missing grant is the honest repair.
--
-- 148's `revoke all … from public` is deliberately NOT disturbed: the posture
-- it set (nobody by default, named roles only) is correct, and this file only
-- adds the name it left out. `tm8_app`'s grant is likewise left in place —
-- harmless, and removing it would be an unrelated change riding along.

-- NO `set role tm8_graph_owner` AROUND THE GRANT, WHICH EVERY OTHER RECENT
-- FILE OPENS WITH. Only a function's owner may grant on it, and 148 created
-- `repo_slug_from_url` WITHOUT taking the graph-owner role first — so it is
-- owned by `tm8`, alone among the functions in this chain (`pr_owning_session`
-- and `observer_watch_targets` are both `tm8_graph_owner`). Taking the role
-- here would make this migration fail with the very error it exists to fix,
-- which it did on the first run of this file. The grant therefore stays in the
-- migration's own role, and only the functional check below drops into the
-- definer's seat.
--
-- The ownership split is left alone deliberately. `alter function … owner to`
-- would tidy it, and it is not this file's business: re-owning a function
-- rewrites its ACL, and doing that to unbreak a scheduler job would bundle a
-- silent privilege change into a one-line repair. Worth its own file.

-- The one repair. Idempotent: `grant` on an existing privilege is a no-op, so
-- this file is safe to replay, which a tranche suite does.
grant execute on function internal.repo_slug_from_url(text) to tm8_graph_owner;

-- VERIFY — asserts the post-state from the seat that actually failed, and
-- holds on an empty database (the function exists from 148, which is in every
-- chain that reaches this file).
do $$
declare
  slug text;
begin
  if not has_function_privilege(
       'tm8_graph_owner', 'internal.repo_slug_from_url(text)', 'execute'
     ) then
    raise exception 'VERIFY 195: tm8_graph_owner still cannot execute repo_slug_from_url';
  end if;

  -- Not just the catalogue bit: actually cross the door the watcher crosses.
  -- `set_config(…, true)` is `SET LOCAL` — it reverts when this transaction
  -- ends, so the role change cannot leak into the rest of the chain even if
  -- the assertion below raises.
  perform set_config('role', 'tm8_graph_owner', true);
  select internal.repo_slug_from_url('https://github.com/owner/name.git') into slug;
  perform set_config('role', 'none', true);
  if slug is distinct from 'owner/name' then
    raise exception 'VERIFY 195: repo_slug_from_url returned % from the definer seat', slug;
  end if;

  -- The posture 148 set must survive: PUBLIC still has nothing.
  if has_function_privilege(
       'public', 'internal.repo_slug_from_url(text)', 'execute'
     ) then
    raise exception 'VERIFY 195: PUBLIC regained execute on repo_slug_from_url';
  end if;
end
$$;


