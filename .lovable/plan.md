# Audit — Friendly Name punctuation blocks Start Monitoring

## What operators hit

The per-source Friendly Name field suggests `e.g. NBC Program, Truck A, Camera ISO` — but that
exact value is rejected before any caller is created. Anything outside letters, digits, spaces,
underscore and hyphen fails: commas, `#`, parentheses, `/`, `@`, em dashes, periods.

The **session** name is not affected (it allows up to 200 characters of free text). Only the
per-source Friendly Name is restricted.

## Where the rejection happens (verified in code)

Two layers apply the same restrictive pattern to the operator's Friendly Name:

1. `supabase/functions/provision-session/index.ts:42` — request schema:
   `name: z.string().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/)`. This fails first, so
   Start Monitoring dies at the request boundary with a validation error.
2. `supabase/functions/mako-ingest/pull-sources.ts:35` — `NAME_PATTERN = /^[A-Za-z0-9 _-]+$/`,
   applied by `validateName` (trim, 1–64 chars) and returning `400 invalid_name`. The same
   pattern is duplicated as `NameSchema` in `mako-ingest/index.ts:45` for the retired
   listener path.

Not the cause, confirmed:

- No database restriction on the name. `session_runtime_routes.name` has no pattern check;
  `ingest_sources` only has a length check of 1–120 characters.
- Machine identity never derives from the name. The idempotency key is the route UUID
  (`provisioning.ts:186`), the infrastructure ID is the generated `src_xxxxxx`, and the
  playback path is the returned `<src_xxxxxx>-opus`. The name travels only as a label.

Unverified: whether the upstream caller API applies its own name pattern. That cannot be
checked without creating a live caller, so verifying it is the first implementation step.

## Recommended smallest fix

Keep the two identity domains separate — loosen only the human label, leave every machine
identifier validator untouched.

1. Introduce one shared "display label" rule used by both layers:
   trim, require 1–64 characters after trimming, reject control characters, and reject
   characters that are dangerous in a shell or path context: quotes, backticks, `$`, `\`,
   `;`, `|`, `&`, `<`, `>`, `*`, `?`, `%`, newlines, and null bytes. Everything else —
   letters (including accents), digits, spaces, `,` `.` `#` `(` `)` `/` `@` `-` `—` `_` `:`
   `+` `'` — is accepted.
2. Apply it in `provision-session` (replacing the regex on the slot schema) and in
   `mako-ingest`'s `validateName` / `NameSchema`. Both continue to reject empty and
   over-length values and continue to return `invalid_name`.
3. Leave untouched: source-ID pattern `^src_[a-f0-9]{6}$`, host/port validators, UUID
   idempotency-key validator, playback-path handling.
4. If the upstream caller API turns out to reject punctuation too, send it a sanitized
   label (name with disallowed characters replaced) while storing the operator's exact
   Friendly Name in MAKO. MAKO's own display never depends on the upstream label — the
   existing live test already showed upstream omitting the name entirely.
5. Align the form: enforce the same 64-character limit and trimming client-side with an
   inline message, so the operator learns about a bad character before submitting.

## Tests

Accepted, round-tripping unchanged after trim: `NBC Program, Truck A`, `Cam #1`,
`Studio (A)`, `MSG Network / Feed 1`, `Rangers @ Devils`, `Studio A — Backup`,
`Phase A.2 Live Test`.

Rejected: empty, whitespace-only, 65+ characters, values containing `;`, `` ` ``, `$(`,
`|`, newline, null byte.

Also asserted: leading/trailing whitespace trimmed; length measured after trimming;
the idempotency key stays the route UUID and the infrastructure/playback identifiers stay
generated regardless of the label.

## Explicitly out of scope

My Sources and the retired listener-style selection workflow (including the reported 502
and missing panes), provisioning lifecycle and idempotency semantics, Phase D leases,
teardown, reconciliation, RLS, sharing, Quinn, Timeline, Ops.

## Sequencing

This waits until after the staged explicit End Session production test on the live session,
so Phase D validation is not disturbed.
