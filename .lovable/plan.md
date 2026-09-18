# Preflight & Test Connection — Engineering Diagnostic Audit (audit only, nothing changed)

## 1. Current Test Connection implementation

- Component: `src/pages/CreateSession.tsx`, button at lines 847-861, handler `testConnection` (lines 251-276).
- Helper: `probeStream(streamNameForSlot(slot))` in `src/lib/stream-paths.ts` (lines 318-345), which calls the shared `negotiateWhep` (lines 172-308).
- What it actually does: a browser-side WHEP POST to `<<whep base>>/camN/whep` (the legacy fixed slot path), checks the response really is SDP, then DELETEs the WHEP resource and closes the peer connection.
- Creates a caller: NO. Contacts the DigitalOcean caller API: NO. Attempts an SRT handshake: NO. Creates `session_runtime_routes`: NO. Creates or leaves infrastructure behind: NO (only a transient WHEP viewer, explicitly torn down). Conflicts with endpoint exclusivity: NO.
- Only checks whether a MediaMTX path already has a publisher — it says nothing about the operator's SRT listener.
- Timeout behaviour: none. It relies entirely on `fetch` default behaviour; there is no abort, no deadline.
- Returned statuses: `available`, `no_publisher`, `misconfigured`, `failed` (mapped from `answer` / `codec_unsupported` / `404` / HTML-or-non-SDP body / network error).
- Disabled condition: for every caller-first slot (a typed host + port — i.e. the normal production path) it refuses with "Test Connection isn't available for this input yet." Reason documented in code: the `camN` path is not that slot's feed, so probing it would report on an unrelated stream.
- Net conclusion: **today Test Connection is effectively dead for real production sources** and, where it does run, it tests MAKO's own playback path, not the operator's endpoint.

## 2. Start Monitoring failure path

Path: `createAndNavigate` (CreateSession 278-389) → `provisionSessionRemote` (`src/lib/sessions-remote.ts` 155-185) → `provision-session` Edge Function → `provisioning.ts` state machine → caller API `POST /pull-sources` → mako-pull-manager → systemd `mako-pull@` → FFmpeg/libsrt → MediaMTX → Session Room WHEP.

Real, currently distinguishable failure states:

| FAILURE | WHERE DETECTED | CURRENT STATUS/ERROR | REACHES FRONTEND | TECHNICAL DETAIL | SAFE USER-FACING MEANING |
|---|---|---|---|---|---|
| Malformed host / bad port | zod `SlotSchema`, and defence-in-depth in `pull-sources.ts` | `invalid_body` 400 | Yes, as raw code | Field-level only, not surfaced | "Address or port is not valid." |
| Endpoint held by another MAKO route | `reserve_session_runtime_route` | `endpoint_in_use` 409 | Yes, friendly message | Which endpoint | "Another MAKO session reserves this host/port." |
| Slot already bound to a different endpoint | reservation | `endpoint_conflict` 409 | Yes | Slot number | "This slot is connected to a different address." |
| Route still tearing down | reservation | `route_tearing_down` 409 | Yes | — | "Still being released, retry." |
| Key permanently deleted | caller API 410 | `route_tombstoned` | Yes | — | "Connection permanently removed." |
| Caller creation failed / API unreachable | `upstream()` in provision-session | `provisioning_failed` 502 (+ `upstream_unreachable`) | Yes, but collapsed into one message | HTTP status is logged server-side only | "MAKO could not create the connection." |
| Caller API not configured | env check | `service_unavailable` 503 | Yes | — | "Infrastructure unavailable." |
| Persist/save failure | finalize/save RPCs | `route_persist_failed`, `save_failed` | Yes | — | "Could not save; nothing left running." |
| Route never attached on a live session | `inputsFromRecord` (stream-paths 402-412) | pane status `provisioning_failed` → tile label "NOT CONNECTED" | Yes | None | "MAKO has no route for this source." |
| No publisher on the path (SRT never connected, or media stopped) | `negotiateWhep` 404 in LiveCamera | `no_publisher` → tile "No video streaming", silent retry | Yes, as a label | HTTP 404 only | "No media publication detected." |
| WHEP base misconfigured / HTML body | `negotiateWhep` | `misconfigured` | Yes | URL + body head in console | "Playback endpoint misconfigured." |
| ICE/peer failure after answer | `pc.onconnectionstatechange` | `reconnecting` → `failed` after 3 attempts | Yes | — | "Playback connection failed." |
| Media disappears after working | LiveCamera 404 on retry | `no_video` | Yes | — | "Media publication stopped." |

**Not currently distinguishable anywhere in MAKO:** DNS failure, network unreachable, connection refused, connection timeout, SRT handshake rejection, passphrase/encryption mismatch, caller service exiting or restart-looping, "SRT connected but no media". All of these collapse into either `provisioning_failed` (creation-time) or `no_publisher` (after navigation). MAKO today cannot tell "listener unreachable" from "listener reachable but publishing nothing".

## 3. FFmpeg/libsrt evidence (read-only assessment)

No caller-host source lives in this repo; the only contract MAKO has is the FastAPI surface used by the Edge Functions:

- `POST /pull-sources`, `GET /pull-sources/{id}`, `GET /pull-sources/by-idempotency-key/{uuid}`, `DELETE /pull-sources/{id}`, `GET /pull-sources/{id}/telemetry/media` (E.2B, authored but not deployed), plus legacy `/sources`.
- Fields MAKO consumes: `source_id`, `host`, `port`, `output_path`, `idempotency_key`, `name`, `service`, `state`, `deleted_at`. `state` is the only health-ish field, and it is used solely to detect `tombstoned`.
- Therefore: process exit status, stderr/journal, `systemctl status` and `mako-pull-manager list` output are **not exposed to MAKO at all** today. libsrt/FFmpeg messages (`Connection timed out`, `Connection refused`, `Network is unreachable`, `Failed to resolve hostname`, `Connection setup failure: connection rejected`, `srt_connect failed`) exist on the host but never cross the API boundary.
- No DO changes were made and no logging was enabled during this audit; the above is derived from the API contract in code, not from live inspection.

Normalizable categories **if and only if** the caller API later exposes exit status + last stderr line: `dns_failed`, `connection_refused`, `network_unreachable`, `connection_timeout`, `srt_handshake_rejected`, `socket_error`, `unknown`. Raw journal text must never be returned to the browser — only a normalized category plus a short sanitized reason.

## 4. Preflight feasibility

A genuine "can MAKO reach this SRT listener?" answer requires an SRT caller handshake from the caller host. That is feasible with the existing architecture only by adding a **new, explicitly ephemeral probe endpoint** on the caller API (e.g. `POST /pull-probes` → short-lived `ffmpeg -f mpegts -i "srt://host:port?mode=caller&timeout=..." -t 2 -f null -`), because:

- Existing `POST /pull-sources` creates a persistent systemd unit and manager config — unusable as a probe (it would leave infrastructure and publish a path).
- The probe must run server-side: browsers cannot speak SRT at all, so no frontend-only preflight can ever answer the question.
- Required guarantees before such an endpoint may exist: hard wall-clock timeout (≤ 5-8 s), no systemd unit, no manager config entry, no MediaMTX publication, single-flight per endpoint, refusal (not pre-emption) when `check_endpoint_availability` reports `in_use`, no `session_runtime_routes` row, no DB write at all, and a normalized result object.
- **Conclusion: with today's infrastructure a real SRT connection test cannot be performed.** It is architecturally feasible, but it requires one additive caller-API endpoint that does not exist yet. Until then, Test Connection can only honestly report configuration validity and MAKO-side reservation state.

## 5. Configuration-time validation

Already implemented: host+port presence (`isConfigured`, `hasManualEndpoint`), port digits-only input coercion, port range 1-65535 and non-empty host (`isValidEndpoint`), server-authoritative reservation check with 5 s revalidation (`use-endpoint-availability.ts`), Edge-side zod bounds and hostname-label validation (defence in depth).

Missing at configuration time: IPv4 octet-range validation (`999.1.1.1` passes today), IPv6 handling (unsupported and unreported), FQDN/hostname validity in the browser, an explicit "unroutable/private address" advisory, and any visible checklist of what passed. Syntactic validity is never to be presented as reachability.

## 6. Proposed diagnostic contract (design only)

Retained categories, given what is provable today:

- `configuration_invalid` — CONFIRMED: the entered address or port is not a valid endpoint. Causes: typo, missing port, IPv6 entered. Next: correct the field.
- `endpoint_in_use` — CONFIRMED: another MAKO runtime route currently reserves this host:port. Causes: session still live elsewhere, teardown unconfirmed. Next: end the other session or wait for reconciliation. Explicitly **not** a reachability statement.
- `endpoint_available` — CONFIRMED: no MAKO route reserves this host:port. Explicitly **not** a reachability statement.
- `provisioning_failed` — CONFIRMED: MAKO could not create a caller for this endpoint. Causes: caller host or API problem. Next: retry, then escalate to MAKO infrastructure.
- `no_media_publication` — CONFIRMED: no media publication exists for this route's playback path. Causes: listener not sending, SRT never established, encoder stopped, network path. Next: confirm encoder is running and pushing.
- `playback_endpoint_misconfigured` — CONFIRMED: the WHEP endpoint returned a non-SDP response.
- `unknown` — CONFIRMED: MAKO has no observation for this endpoint.

Categories to add **only after** the probe endpoint and caller-status exposure exist: `dns_failed`, `network_unreachable`, `connection_refused`, `connection_timeout`, `srt_handshake_failed`, `connected_no_media`, `connected`. MAKO must never print "firewall blocked" as a fact — firewall/NAT appear only in a clearly-labelled possible-causes list under `connection_timeout`.

## 7. Session Room gaps

Current engineer-visible states: provisioning failure before navigation is a toast on the Create page only (nothing persists); a route that never attached shows the pane badge "NOT CONNECTED"; a caller that exists but never connects shows "No video streaming" with silent retries; WHEP 404 is identical to "encoder idle"; loss after working also shows "No video streaming"; caller restart loops are invisible. No endpoint is displayed, no failure category, no timestamp, no last-confirmed state, no action.

What existing data can already honestly support the proposed banner: the configured host:port (session record), "runtime route created / never created" (attachment + `provisioning_failed`), "no media publication detected" (WHEP 404), the observation timestamp (browser clock), and E.2/E.3 provenance for anything shown as measured. "Last confirmed state: SRT caller created" is supportable; "SRT handshake established" is not, until the caller API exposes it.

## 8. Automatic preflight before Start Monitoring

Recommended: **D (combination)** — always-on non-network validation (format, port, reservation) shown as a live checklist, Start Monitoring never blocked on a network test, and a manual Test Connection once the probe endpoint exists. Rationale: some listeners accept only one caller, so an automatic probe risks occupying the endpoint or producing false negatives immediately before the real caller connects; and blocking Start Monitoring on a test MAKO cannot yet perform would break the working production path.

## 9. Endpoint-in-use semantics (unchanged)

Reservation and reachability stay separate vocabularies. "Available to MAKO" / "In use by another MAKO session" is the reservation axis; "connected / no response / handshake failed" is the network axis. Neither may be rendered in the other's language. Phase D exclusivity and the E.2/E.3/E.5B truth rules are untouched.

## 10-11. Recommended UX (conceptual)

Per source card: a Configuration block with three honest checks (address format valid, port valid, available to MAKO), then Test Connection whose result is rendered as CONFIRMED FACT plus POSSIBLE CAUSES plus SUGGESTED NEXT CHECKS — never a single guessed cause. In the Session Room, the same vocabulary as a source-level banner: configured endpoint, last confirmed state, current observation, possible causes, timestamp, collapsible technical detail, `Run Diagnostics` and `Configure Source`, and a copy-diagnostic-summary action for handing to the encoder operator, venue, or network team.

## 12. Recommended architecture and first phase

Architecture: one shared diagnostic vocabulary module in the frontend (`category` + `confirmedFact` + `possibleCauses` + `nextChecks` + `observedAt` + provenance), consumed by both the Create page and the Session Room; a thin Edge Function boundary for any server-side probe, with the caller-API token never reaching the browser; and normalized categories only, never raw logs.

**Proposed first implementation phase (F.1) — no infrastructure dependency:**
1. Add the diagnostic vocabulary module and its unit tests.
2. Add true configuration-time validation (IPv4 octet ranges, hostname validity, explicit IPv6-unsupported message) and render the three-check Configuration block.
3. Replace the currently-misleading Test Connection for caller-first slots with an honest configuration-and-reservation check, clearly labelled as not a reachability test.
4. Add a Session Room source-level diagnostic banner built only from data MAKO already has (endpoint, route created or not, media publication observed or not, timestamp) plus copy-summary.
5. Defer the real SRT probe to F.2, which requires the additive ephemeral probe endpoint and caller-status exposure on the caller host.

## Confirmation

No application code, database schema, migration, RLS policy, Edge Function, deployment, publish, service restart, FFmpeg/MediaMTX/caller change, Phase D, endpoint-exclusivity or E.5B change was made. This audit is reads only.
