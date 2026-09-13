# Browser Audio Monitoring — One Active Source at a Time

Goal: play all sources through the new Opus-enabled playback paths, start everything muted, and let the operator listen to exactly one source at a time without ever interrupting video.

## What changes for the operator

- Video keeps working exactly as today, but is now pulled from the browser-friendly stream that carries Opus audio.
- Every pane starts silent. Nothing becomes audible on its own — not on connect, not on reconnect.
- Each pane's speaker button means "listen to this source". Pressing it silences whatever was audible and makes that source audible instantly.
- Pressing the speaker button on the source you are already listening to turns audio off completely.
- The pane being monitored shows a clear speaker indicator; all others show the muted speaker.
- Clicking a pane still selects it visually (focus) but no longer starts audio by itself.
- If the monitored source drops out, no other source takes over its audio. When it comes back it resumes as the monitored source.
- Contribution details shown to operators (SRT address, stream ID `publish:camN`, source names) stay exactly as they are.

## Technical detail

### 1. Playback path separation (`src/lib/stream-paths.ts`)
- Keep `streamNameForSlot(slot)` → `camN` as the ingest/contribution identity used by all UI, Test Connection, and copy fields.
- Add `playbackStreamName(streamName)` → appends `-opus` when not already suffixed, plus `playbackStreamNameForSlot(slot)` → `camN-opus`.
- Apply the mapping inside `whepEndpointForStream()`/`negotiateWhep()` at the single point where the WHEP URL is built, so playback resolves to `https://stream.makosrt.com/camN-opus/whep` while `StreamInput.streamName` stays `camN`.
- `probeStream()` (Test Connection) keeps probing the raw ingest path — contribution verification is unchanged.
- Diagnostics line in Session Room will show both ingest path and resolved playback URL.

### 2. Centralized exclusive audio state (`src/pages/SessionRoom.tsx`)
- Change `audioSource` initial value from `activeInputs[0]?.id` to `null` (`activeAudioSourceId`).
- New `toggleAudioSource(inputId)`: if already active → set `null`; otherwise set to that id. This is the only writer of audio state.
- `selectSourceForViewer` (single click) sets focus only; it no longer sets audio or clears mute-all.
- Remove the auto-assign of audio when the focused source is replaced (source list shrink handler keeps focus logic, drops `setAudioSource`).
- Mute All is folded into the single state — no hidden remembered selection. Pressing Mute All sets `activeAudioSourceId = null` (replacing the separate `muteAll` flag). All sources mute and stay muted until the operator explicitly presses "Listen to this source" on a pane. The toolbar button renders from state: active when `activeAudioSourceId === null`, labelled "Muted" / "Mute All"; pressing it while already null is a no-op. The **M** shortcut follows the same rule.
- Pass `isAudioActive={activeAudioSourceId === input.id}` and `onAudioSelect={() => toggleAudioSource(input.id)}` to every tile, including the fullscreen overlay and drag ghost (ghost stays muted).

### 3. Tile control (`src/components/SignalTile.tsx`)
- Speaker button reflects state: `Volume2` + primary tint when active, `VolumeX` muted when not; `aria-pressed`, title "Listen to this source" / "Stop listening".
- Existing "Audio" badge stays as the subtle active indicator; no card redesign.
- Keep the existing autoplay-blocked click-to-enable overlay and only surface it when the browser actually refuses.

### 4. Player (`src/components/LiveCamera.tsx`)
- `<video>` keeps `muted` on mount; the mute effect already reacts to the `muted` prop against the existing element, so switching audio never touches the peer connection, WHEP resource, or `srcObject`.
- Ensure the mute effect also re-applies after `ontrack` (new `srcObject`) so a reconnecting source honours the current selection rather than defaulting to audible.
- `play()` rejection stays handled via `onAudioBlocked` — no error toast.

### 5. Popouts
- `LayoutPopoutPage` / `SourcePopoutPage`: audio still driven by the passed-in selection; popouts start muted and keep the single-active-source rule within their own window.

### Not touched
SRT ingest, port 8890, stream IDs, source creation/config UI, MediaMTX/FFmpeg/Caddy/Cloudflare, backend schema, auth, sharing, focus mode, Quinn, Timeline, Ops, layouts, ordering, naming.
