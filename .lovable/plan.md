# Phase F.1A — Create Session Operator Guidance & Field Definitions

## Outcome

Improve Create Session with concise field-level guidance and optional deeper explanations, while preserving every existing validation, configuration-check, provisioning, session, source, and lifecycle behavior.

## Implementation

### 1. One reusable information control

Create a small Create Session guidance component built on the existing Radix/shadcn Popover primitives.

- Render a quiet information icon beside supported labels or actions.
- Give every trigger a specific accessible name such as `About session name`.
- Open on desktop hover or click, and on touch tap; support keyboard focus/activation and Escape-to-close through a controlled Radix Popover.
- Use a compact title and body, matching the existing MAKO glass/token styling.
- Keep only one explanation open at a time by controlling the open item from Create Session.
- Do not add a UI framework or redesign the page.

### 2. Session fields

Update only labels and supporting copy in `CreateSession.tsx`:

- **NAME (optional)**
  - Visible: “Give this monitoring session a recognizable name.”
  - Popover: explain recognition, signed-in Recent Sessions, temporary-session boundary, and automatic naming from the first configured source.
- **PURPOSE**
  - Visible: “Describe how this session will be used.”
  - Popover: explain operational context and explicitly state that Purpose does not change the incoming signal, SRT connection, or media processing.
- **DEFAULT EVENT TIME ZONE**
  - Visible: “Controls how event timestamps are displayed.”
  - Popover: explain UTC as the underlying recorded reference, operator-facing display conversion, and that changing display time zone does not alter recorded event time.
- **SESSION DURATION**
  - Visible: “Sets the planned duration of this monitoring session.”
  - Popover: explain planned session end and explicitly separate duration from SRT signal and encoding.

The existing Purpose selector, timezone selector, duration picker, defaults, state updates, and Phase D timing behavior remain unchanged.

### 3. Source guidance

- Replace the currently confirmed unsupported Sources introduction — “it discovers codec, resolution, bitrate, and latency automatically” — with: “Tell MAKO where to connect to each feed. Signal details that MAKO can directly observe will appear automatically once monitoring begins.”
- **FRIENDLY NAME**
  - Use the requested visible helper, full popover explanation, and placeholder `e.g. Program Feed, Truck A, Camera ISO`.
  - State that the label is human-readable, reused throughout the Session Room/diagnostics/collaboration, and does not affect SRT.
- **SRT ADDRESS / IP**
  - Add the requested visible helper and popover explaining MAKO’s Caller role, externally reachable versus typical private LAN addresses, possible remote NAT/UDP forwarding, and the limit that validation does not prove reachability.
  - Guidance only: private IPv4 addresses remain accepted under existing rules.
- **PORT**
  - Add the requested visible helper and popover explaining the remote Listener’s UDP port, endpoint pairing, and possible remote routing requirements without claiming firewall verification.
- **ADVANCED**
  - Add only: “Optional connection settings for workflows that require them. Most sessions should use the defaults.”
  - Keep the existing Passphrase option and reveal behavior unchanged.

### 4. Existing F.1 configuration workflow

- Keep the three Configuration checks and reservation wording.
- Align the separate occupancy warning from “connected to another MAKO session” to reservation-only language, because the current check proves MAKO occupancy rather than an active SRT connection.
- Replace the current Configuration disclaimer with: “Configuration checks validate the information MAKO can confirm before monitoring begins. They do not test SRT network reachability.”
- Keep caller-first **Check Configuration** and add: “Checks address format, port and MAKO session reservation. Network reachability is not tested.”
- Preserve the legacy Test Connection branch exactly; caller-first checks still make no probe, route creation, handshake attempt, or additional backend request.
- Add the requested Start Monitoring explanation beside the primary action, including route creation, attempted Caller connection, later observations, and the distinction between valid configuration and reachability.
- Do not alter existing invalid-address, invalid-port, or reserved-endpoint gates.

### 5. Optional convenience guidance

- Add “Reuse previously saved endpoint information.” to the Address Book trigger/dialog context.
- Add “Save this source configuration for future sessions.” near Save Source.
- Keep both optional and subordinate to direct Friendly Name + address + port entry.
- Do not reintroduce My Sources or change save/select behavior.

### 6. Truthfulness pass

Audit visible Create Session copy and correct only unsupported claims. The current scan confirms the Sources introduction incorrectly claims automatic bitrate and latency discovery; remove it. Check the final rendered guidance for claims of packet loss, RTT, transport latency/bitrate, firewall state, remote-listener state, reachability, or SRT-handshake evidence, allowing those terms only where the copy explicitly says MAKO has not tested or proven them.

## Files

Expected additions/changes:

- Add one reusable Create Session guidance/popover component under `src/components/session/`.
- Modify `src/pages/CreateSession.tsx` for labels, helper text, popovers, convenience guidance, and unsupported-copy correction.
- Modify `src/components/session/ConfigurationStatus.tsx` for the exact F.1A boundary statement.
- Modify `src/components/AddressBookModal.tsx` only if needed to place the requested concise Address Book guidance cleanly.
- Add a focused F.1A test file and update existing caller-only expectations only where corrected copy replaces old wording.

No backend, schema, infrastructure, diagnostic logic, validation, telemetry, incident, Timeline, Quinn, authentication, guest, provisioning, playback, or lifecycle files will change.

## Verification

Focused tests will verify all 15 requested truthfulness and accessibility cases, including keyboard opening and Escape closing of the information control. Existing F.1 tests will continue to pin reservation/reachability boundaries and caller-first Check Configuration behavior. Then run the complete test suite and TypeScript check.

Nothing will be published or deployed.
