# Operator vs Collaborator Authorization Audit (read-only)

No code, schema, policies, roles, UI, or `mako-ingest` were changed. Findings below cite the actual file/table/policy.

## 1. Authentication paths

| Path | Where | auth.users | profiles | user_roles | Becomes account holder? |
|---|---|---|---|---|---|
| Email sign-up | `src/pages/AccountPage.tsx` -> `useAuth.signUp` | yes | yes, via `handle_new_user()` trigger (`role` from metadata, default `operator`) | no | yes |
| Email sign-in | `AccountPage` / `useAuth.signIn` | existing | existing | no | yes |
| PIN join, signed out | `/join` -> `join-session` function | no | no | no | no; guest identity is localStorage only (`src/lib/identity.ts`) |
| PIN join, signed in | same | existing | existing | no | already one; gains a `shared_session_access` row (`role: viewer`) |
| Root/admin test user | `supabase/functions/create-test-user/index.ts` | yes | yes (`role: account_owner`) | no (the single `admin` row was added by migration) | yes |

There is **no invitation-acceptance flow and no magic link**. Sharing = giving out session ID + PIN (`ShareSessionDialog`), so every "invited collaborator" arrives either as a guest or as a person who signed up normally through the same form. There is no authenticated identity whose only purpose is collaboration.

## 2. Role model

- `public.user_roles` + `app_role` (`admin|moderator|user`) + `has_role()` is the only security-authoritative role store. Current data: 1 user, 1 role row (`admin`).
- `profiles.role` is a free-text display label (current value `account_owner`); it is not referenced by any RLS policy or Edge Function. Not authorization.
- `has_role()` is used by RLS on `feedback`, `ingest_sources`, and by `mako-ingest` for `create_source` / `delete_source`. `moderator`/`user` are unused.
- No client-side role helper exists at all — no `useRole`, no admin gate in the UI.

## 3. Session ownership

`public.sessions.owner_id` is authoritative; RLS restricts select/insert/update/delete to `owner_id = auth.uid()`, plus a read path via `has_session_access(id, auth.uid())`. `save-session` re-checks `existing.owner_id !== userId` -> 403 and always writes `owner_id` from the JWT, so ownership cannot be spoofed. `payload.guestOwned`/owner fields in `payload` are display-only. A user cannot see another user's session without a `shared_session_access` row — or the PIN, which `join-session` accepts from anyone.

## 4. Sharing / collaboration

- Grants are created only inside `join-session` (service role) after a correct PIN; role is `owner` or `viewer`.
- Revocation: owner sets `revoked_at` (`sessions-remote.ts`); `has_session_access()` ignores revoked rows. No expiration.
- A viewer can read `sessions`, `session_sources`, `session_timeline_entries`, `session_focus`, and can insert timeline entries and focus rows — i.e. collaborators can change the shared focus state. They cannot edit session config (`sessions` update is owner-only), cannot re-share (`shared_session_access` insert is owner-only), cannot transfer ownership, and cannot see the owner's other sessions.
- **But** becoming a collaborator today does give full normal-user capability, because that capability is unconditional (below), not because of the share.

## 5. `/create` authorization

`/create` has no route guard, no auth requirement, and explicitly supports guests (`isGuest`, `guestOwned` in `CreateSession.tsx`). `save-session` enforces only "is authenticated" + ownership. **There is no "may create and own sessions" concept anywhere.** Every authenticated identity has it, and unauthenticated visitors get a local-only variant.

## 6. `/join` behaviour

Guests, collaborators and owners all reach `/create`, `/sessions`, `/account`, `/ops` identically — none of these routes check anything. Joining grants no extra DB reach beyond the one session; the "gain" is that all app routes were already open.

## 7. Route / navigation protection

`src/App.tsx` wraps every route in `AppLayout` only. No `ProtectedRoute`, no admin route, no dev route. Sidebar (`AppSidebar.tsx`) shows the same items to everyone; `/ops` gates on "is there a session", not on role. All real enforcement lives in RLS and the Edge Functions.

## 8. Developer panel exposure

`MakoIngestTestPanel` renders unconditionally at `CreateSession.tsx:830` — visible to signed-out visitors, guests, collaborators and admins. Buttons rely entirely on the Edge Function checks: `list_sources` requires only authentication, `create_source`/`delete_source` require `has_role(admin)`. `list_sources` returns the **global** upstream `/sources` list, so any signed-in person can enumerate every tenant's source IDs, ports and playback paths. That is the one real leak today.

Recommendation: **B** — move it behind an admin-only area (render only when `has_role(admin)`), and additionally scope or admin-gate `list_sources`. Keeping the code is useful at this stage; removing it entirely (C) loses troubleshooting, and leaving it rendered (current state) leaks infrastructure.

## 9. Source registry readiness

`ingest_sources` RLS: owner full CRUD scoped to `owner_id = auth.uid()`, admins read/update all. `guard_ingest_source_infra_columns()` blocks non-service writes to `srt_port`, `playback_path`, `infrastructure_source_id`, lifecycle/connection status. `create_source` sets `owner_id` from the JWT; `delete_source` looks the row up by stored `infrastructure_source_id` and checks owner-or-admin, refuses unregistered rows and active attachments. The registry is already tenant-safe; only the admin gate and the global `list_sources` stand between it and Operator use.

To let a normal Operator work, exactly three things must change (not now): drop the admin gate on `create_source`/`delete_source` (keeping ownership checks and adding a per-owner quota), make source listing read `ingest_sources` scoped to `auth.uid()` instead of the upstream global list, and add a `rename` action limited to `name` on owned rows.

## 10-11. Gap and privacy rules

| Rule | Status | Layer |
|---|---|---|
| 1 other Operator's session hidden | enforced | RLS `sessions` + `save-session` |
| 2 other Operator's sources hidden | enforced for `ingest_sources` RLS; **not** for `list_sources` (global upstream list to any signed-in user) | RLS / Edge Function gap |
| 3 invite scoped to one session | enforced | `shared_session_access` + `has_session_access()` |
| 4 invite grants no Sources library | enforced | RLS |
| 5 no reusable source access | enforced | RLS |
| 6 collaborator cannot attach owner's source | enforced | RLS `session_sources` insert requires `is_session_owner` |
| 7 knowing a `src_` ID is not enough | enforced | admin gate + registry ownership |
| 8 admin tooling separated | **not enforced** | panel rendered to everyone; `list_sources` auth-only |

Operator-vs-collaborator gap: the distinction does not exist. It also does not currently cause harm, because every authenticated person is intended to be an Operator and there is no collaborator-only account type.

## 12. Recommended capability model

**Option D, with one correction.** Do not add `operator` to `app_role` and do not add `can_operate_mako`. Rationale from the architecture: collaboration never mints an account (PIN only), so "authenticated" and "Operator" are the same population; a second role system would need backfill and a default-grant path for every new sign-up, with no security gain. Keep:

- MAKO Admin = `user_roles.role = 'admin'` (the existing authoritative check).
- MAKO Operator = any authenticated user; scope is enforced by `owner_id = auth.uid()` in RLS, not by a role.
- Collaborator = an `shared_session_access` row on one session.
- Guest = PIN-verified, no DB identity.

Revisit only if a future flow creates accounts that must never own anything.

## 13. Minimal Phase 4 changes (not implemented)

1. `mako-ingest`: replace the admin gate on `create_source`/`delete_source` with authenticated + ownership (`owner_id = auth.uid()`, admin override retained), add a per-owner source cap.
2. New `list_my_sources` action or direct client select on `ingest_sources` (RLS already scopes it); keep the global `list_sources` admin-only.
3. New `rename_source` action, name-only, owned rows.
4. Gate `MakoIngestTestPanel` on `has_role(admin)` and move it off `/create`.
5. Add an `isAdmin` client hook (display gating only, never security).

## 14. Multi-tenant risks found

- `list_sources` = global infrastructure list to any signed-in caller (`mako-ingest/index.ts`).
- `src/lib/stream-paths.ts` maps slot 1-4 to fixed `cam1..cam4-opus`, i.e. global camera ownership; per-source `playback_path` from the registry must win before multiple creators run at once.
- `session-store.ts` keeps sessions in `localStorage` (`mako_sessions_v3`) scoped only by the locally stored member identity — same-browser account switching can bleed history.
- "One active session per user" is enforced client-side only (`CreateSession.tsx:327`).
- `MakoIngestTestPanel` visible to all.

## Files/tables Phase 4 would touch

`supabase/functions/mako-ingest/{index,create-source,delete-source}.ts`, `src/lib/stream-paths.ts`, `src/pages/CreateSession.tsx`, `src/components/dev/MakoIngestTestPanel.tsx`, new My Sources page/hook, tables `ingest_sources` and `session_sources` (policies only, no structural change required).

Audit ends here — no Phase 4 work started.
