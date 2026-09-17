# Phase C UX Cleanup — Caller-Only Operator Workflow

## Goal
Make the normal operator workflow consistently caller-first: operators enter a friendly name, the external listener address/IP, and port; MAKO connects when **Start Monitoring** is pressed.

## UI changes
1. **Remove Sources from normal navigation**
   - Remove the desktop sidebar’s **Sources** item.
   - Keep the existing mobile navigation unchanged because it already has no Sources item.

2. **Retire the `/sources` operator page**
   - Replace `/sources` with a redirect to `/create` so direct visits cannot expose the retired MAKO Receive workflow.
   - Remove the obsolete page UI/tests as appropriate, while retaining the source-library hook and every backend capability for compatibility.

3. **Simplify Create Session**
   - Remove the **My Sources** query, selector, attach/detach controls, destination display, encoder publishing instructions, and Stream ID instructions.
   - Present each normal enabled slot as:
     - Friendly Name
     - SRT Address / IP
     - Port
     - “MAKO will connect to this SRT listener.”
   - Preserve Address Book selection and saving, Notes, Passphrase/Advanced settings, slot enable/disable behavior, and the existing visual system.
   - Disable **Test Connection** for caller-first inputs instead of allowing a legacy playback probe; keep Start Monitoring as the real connection attempt.

## Compatibility safeguards
- Preserve legacy library-source identities and attachment handling in data models and save/load paths, even though operators can no longer select My Sources in the primary UI.
- Do not expose legacy MAKO Receive destinations when old sessions are opened.
- Do not change Phase C provisioning: Start Monitoring will still await `provision-session`, reserve `session_runtime_routes`, use each route UUID as the caller idempotency key, and resolve the same trusted dynamic playback paths.
- Keep legacy session loading and legacy playback behavior unchanged.
- Do not alter database tables, migrations, records, RLS, RPCs, Edge Functions, caller infrastructure, or runtime-route logic.

## Verification
- Add/update focused UI and routing tests for:
  - no Sources navigation entry;
  - `/sources` redirects to `/create`;
  - no My Sources or MAKO Receive instructions in Create Session;
  - caller fields and exact helper text are present;
  - Address Book remains available;
  - Test Connection is disabled for a configured caller-first input.
- Keep the existing Phase C provisioning tests as regression coverage for route creation, UUID idempotency, dynamic playback, legacy sessions, and retained library attachments.
- Run the full test suite and TypeScript checks.
- Report exact changed files, test counts/results, TypeScript result, and any deviations. Do not publish.

## Technical scope
Expected frontend files are `src/components/AppSidebar.tsx`, `src/App.tsx`, `src/pages/CreateSession.tsx`, and focused tests. Backend and migration files remain untouched.
