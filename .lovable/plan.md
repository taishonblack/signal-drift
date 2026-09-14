# Add MAKO Ingest API Developer Test Panel

## Goal
Add a small, read-only, clearly temporary developer test panel to the authenticated Create Session page so we can verify the end-to-end path:

MAKO browser → Supabase Edge Function `mako-ingest` → `https://api.makosrt.com` → live source list.

## What will change

### 1. New component: `src/components/dev/MakoIngestTestPanel.tsx`
A self-contained panel with:
- Header: "MAKO Ingest API Test" with a subtle "dev" badge.
- One button: "Load Ingest Sources".
- On click, call:
  ```ts
  const { data, error } = await supabase.functions.invoke('mako-ingest', {
    body: { action: 'list_sources' }
  });
  ```
- Local component state only for:
  - `loading`
  - `error`: `'auth' | 'generic' | null`
  - `sources`: array of upstream source objects
- Display a compact table/list on success with columns:
  - Name
  - Source ID
  - Port
  - Output Path
  - State
- Error messages:
  - 401 / auth error: "Your session is not authorized to access ingest sources."
  - Other errors: "Unable to load ingest sources right now."
- No logging of secrets, headers, or tokens.
- No create/delete/edit controls and no polling.

### 2. Placement in `src/pages/CreateSession.tsx`
Render `<MakoIngestTestPanel />` at the bottom of the left column, after the action buttons and the ownership note, inside the `flex-1 lg:flex-[7]` container. It will not alter any existing production controls or form behavior.

## Out of scope
- No changes to ingest configuration, playback, source routing, auth flows, Quinn, Timeline, Ops, Sharing, database schema, or other Edge Functions.
- No browser exposure of `MAKO_API_TOKEN`.
- No writes to Supabase or modification of existing source records.

## Verification
1. Typecheck passes (`bunx tsgo --noEmit -p tsconfig.app.json`).
2. Vitest suite passes (`bunx vitest run`).
3. In the preview, click "Load Ingest Sources" while authenticated and confirm the live source list renders.
4. Confirm the panel is visually marked as temporary/dev tooling and does not disrupt the existing Create Session UI.
