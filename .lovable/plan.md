# Add Secure Test Source Creation to the MAKO Ingest Dev Path

## Goal
Extend the existing developer ingest bridge so an authorized admin can create one ingest source from the browser, without ever exposing the private API token. The existing "Load Ingest Sources" behavior stays exactly as it is.

## 1. Grant the admin role
Currently no account holds the secure `admin` role (the root account only carries an `account_owner` label on its profile), so creation would be blocked for everyone. A database change will:
- Give `root@makosrt.com` the secure `admin` role in the roles table.
- Keep roles in the dedicated roles table (never on profiles), matching the existing security model.

## 2. Ingest bridge: new `create_source` action
Update `supabase/functions/mako-ingest/index.ts`:
- Keep `list_sources` untouched.
- Accept `{ action: "create_source", name: "..." }`.
- Require a signed-in user (unchanged), then additionally confirm that user holds the `admin` role using the existing `has_role` database function. Not authorized → HTTP 403.
- Validate `name` with Zod: string, trimmed, non-empty, max 64 characters, restricted to letters, numbers, spaces, dashes and underscores. The value is only ever sent as a JSON body field — never interpolated into a URL, header, or command.
- Call `POST ${MAKO_API_BASE_URL}/sources` with the server-side bearer token and `{ name }`.
- Return a sanitized JSON body (`name`, `source_id`, `port`, `output_path`, `state`) with an appropriate status; upstream failures return a clean generic error.
- Unknown actions still return 400. No delete action. No secrets or authorization headers logged.

## 3. Dev panel
Update `src/components/dev/MakoIngestTestPanel.tsx`:
- Keep the existing button and source table unchanged.
- Add a visually separated "Create Test Source" section: one text input for the name plus a "Create Test Source" button, disabled while empty or creating.
- On click, invoke the bridge with `action: "create_source"` and the entered name, showing a loading state.
- On success, show a "Source Created" summary (Name, Source ID, Port, Output Path, State), then automatically reload the source list once so the new source appears in the table.
- Nothing is created automatically, nothing is deleted, no polling.

## 4. Error messages
- 401: "Your session is not authorized to access MAKO ingest."
- 403: "Your account is not authorized to create ingest sources."
- Anything else: "Unable to create the ingest source right now."

No upstream details, stack traces, or secrets are shown.

## Out of scope
Create Session production behavior, playback/WHEP/WebRTC, MediaMTX, source routing, session logic, Quinn, Timeline, Ops, Sharing, existing auth flows, and existing source records all stay untouched.

## Verification
1. Typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`) and Vitest suite.
2. Confirm `list_sources` still returns the live list.
3. Signed in as the admin account, create exactly one source named `Remote API Test`, confirm the returned fields, refresh the list, and leave the source in place.
