# Phase F.1 — Configuration & Session Diagnostics

Give engineers honest troubleshooting information before Start Monitoring and inside the Session Room, using only facts MAKO can already observe. No SRT handshake test, no infrastructure, no backend change.

## Outcome

On the source card, under SRT Address / IP and Port, a compact CONFIGURATION block shows three independent checks: address format, port, and MAKO reservation — with copy making clear that reservation is not reachability. The misleading Test Connection for caller-first sources becomes **Check Configuration**, which reports only configuration facts and states plainly that network reachability has not been tested.

Start Monitoring refuses to run on invalid address or port and on an explicitly reserved endpoint, explaining the problem on the spot instead of failing later.

In the Session Room, when a configured source produces no media, the focused source's Inspector shows a diagnostic card: CONFIRMED facts, OBSERVED time, POSSIBLE CAUSES, NEXT CHECKS, plus Configure Source and Copy Diagnostic Summary. A healthy source shows nothing.

## Diagnostic vocabulary

New module `src/lib/diagnostics/signal-diagnostic.ts`:

- `category`: `configuration_invalid`, `endpoint_in_use`, `endpoint_available`, `provisioning_failed`, `no_media_publication`, `playback_endpoint_misconfigured`, `unknown`. No severity.
- Each diagnostic carries `confirmedFacts: string[]`, `possibleCauses: string[]`, `nextChecks: string[]`, `observedAt: string`, `provenance` (e.g. `mako_configuration`, `mako_reservation`, `mako_provisioning`, `whep_playback`) and optional `endpoint` / `sourceLabel`.
- Route creation and media publication are separate confirmed facts. Nothing in the module can emit an SRT-handshake, reachability, or firewall claim; possible causes are always rendered under an explicit "possible" heading.

## Address and port validation

New module `src/lib/diagnostics/endpoint-validation.ts`:

- IPv4 only when four octets, each 0-255, no leading-zero padding ambiguity: `999.1.1.1` fails.
- Hostname/FQDN: per-label `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`, total ≤ 253, no empty labels, at least one letter somewhere so a numeric-looking invalid IP is not accepted as a hostname.
- IPv6 (contains `:` or bracketed) returns a distinct `ipv6_unsupported` result with honest copy.
- Port: integer, 1-65535.
- Reservation stays exactly as today via `check_endpoint_availability` through `useEndpointAvailability`; the hook is extended only to expose `available | in_use | not_checked` instead of a bare boolean, preserving its existing truthfulness rules (errors never become "in use", stale results never overwrite newer ones).

## UI changes

- `src/components/session/ConfigurationStatus.tsx` — the three-line CONFIGURATION block plus the one-line reservation caveat.
- `src/components/diagnostics/SignalDiagnosticCard.tsx` — renders any diagnostic object (confirmed / observed / possible causes / next checks) with optional action slots; used by both the Create page and the Inspector.
- `CreateSession.tsx` — mount the status block; replace the caller-first branch of `testConnection` with `Check Configuration` producing an `endpoint_available` / `endpoint_in_use` / `configuration_invalid` diagnostic (no `probeStream`, no network call beyond the existing reservation RPC); gate `handleStart` on validation; render provisioning failures through the diagnostic card with MAKO-side wording that never blames the remote encoder. Legacy non-caller slots keep today's `probeStream` behaviour untouched.
- `InspectorPanel.tsx` — when the focused source's playback state is `no_publisher`/`no_video`, `provisioning_failed` or `misconfigured`, render the diagnostic card with Configure Source (navigates to the existing `/session/:id` configure route for that session) and Copy Diagnostic Summary. Healthy sources render nothing new. E.2/E.3 measured sections untouched.
- `src/lib/diagnostics/diagnostic-summary.ts` — plain-text handoff built only from the diagnostic object: source, endpoint, observed time, confirmed facts, possible causes, suggested checks, and the closing line that no SRT handshake diagnostic was performed. No tokens, credentials, internal host details or raw logs.

WHEP negotiation, retry behaviour and playback architecture are not modified; existing `no_publisher` / `misconfigured` / `failed` states are only read.

## Tests

New `src/test/signal-diagnostics-f1.test.tsx` and `src/test/endpoint-validation.test.ts` covering all 22 required cases, including: IPv4 octet overflow rejected, IPv6 reported unsupported, availability presented as reservation-only, in-use and invalid configuration both blocking Start Monitoring, valid configuration never claiming reachability, Check Configuration neither probing `camN` nor creating infrastructure, route-created-plus-no-publisher yielding `no_media_publication`, no handshake claim anywhere, possible causes labelled as possibilities, provisioning failure distinguished from remote-source failure, Configure Source routing, summary content and secret-freeness, and a healthy source showing no banner. Then the full suite and TypeScript.

## Untouched

Caller infrastructure, FFmpeg, MediaMTX, WHEP, database schema, RLS, auth, Phase D leases, endpoint exclusivity, E.2, E.3, E.5B, Timeline, Quinn. Nothing published or deployed. Real SRT reachability testing remains F.2.
