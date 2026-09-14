# Add Secure Test Source Deletion to the MAKO Ingest Dev Path

## Goal
Add an admin-only delete action to the developer ingest bridge, then use it to remove exactly one source: `Remote API Test` (`src_b321a8`). Listing and creation behavior stay unchanged, and deletion is not wired into the production Create Session workflow.

## 1. Ingest bridge: new `delete_source` action
Update `supabase/functions/mako-ingest/index.ts`:
- Keep `list_sources` and `create_source` exactly as they are; unknown actions still return 400.
- Accept `{ action: "delete_source", source_id: "src_xxxxxx" }`.
- Require a signed-in user (401 otherwise), then require the secure `admin` role via the same `has_role` check already used for creation (403 otherwise).
- Validate `source_id` strictly against `^src_[a-f0-9]{6}$` and reject anything else with 400. Only the validated value is used, and only as the final path segment.
- Call `DELETE ${MAKO_API_BASE_URL}/sources/<source_id>` with the server-side bearer token.
- Return `{ source_id, deleted: true }` only. Upstream 404 maps to a 404 response; other failures return a clean generic error. Nothing else from upstream is passed through.
- No secrets, tokens, or authorization headers logged.

## 2. Dev panel
Update `src/components/dev/MakoIngestTestPanel.tsx`:
- Preserve the load button, source table, create section, and creation result.
- Add a small "Delete" control in each source row (extra table column).
- Clicking it never deletes immediately — it opens a confirmation dialog showing "Delete ingest source?", the source name, source ID, port, and the note "This will stop the ingest service and release its allocated SRT port." with Cancel and Delete Source buttons.
- On confirm, invoke the bridge with `action: "delete_source"` and that row's source ID, with a deleting state on the confirm button.
- On success show "Source Deleted — [name] has been removed." then reload the list once. No polling.

## 3. Error messages
- 401: "Your session is not authorized to access MAKO ingest."
- 403: "Your account is not authorized to delete ingest sources."
- 404: "The ingest source no longer exists."
- Anything else: "Unable to delete the ingest source right now."

No stack traces, raw upstream errors, server paths, or secrets are shown.

## Out of scope
Create Session production behavior, playback/WHEP/WebRTC, MediaMTX, source routing, session logic, Quinn, Timeline, Ops, Sharing, database schema, and existing auth flows stay untouched.

## Verification
1. Typecheck and the Vitest suite.
2. Confirm the source list still loads and the create section is unchanged (no new source will be created).
3. Delete only `Remote API Test` / `src_b321a8`. `src_ab652c` and `src_b2d8e7` are left alone.
4. Reload the list, confirm `src_b321a8` is gone and the two original sources remain, and confirm port 10022 is no longer held by any listed source.
