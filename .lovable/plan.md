# Fix LiveCamera playback after successful Test Connection

## Diagnosis (from reading the code)

`probeStream()` and `LiveCamera` build the same SDP offer, use the same URL builder, and both now resolve the `Location` header correctly. The difference is what each one requires to be called a success:

- Test Connection only needs the WHEP **HTTP** exchange to work. It POSTs the offer, reads the 201, and tears down. It never waits for ICE, never sets a remote description, never plays media. So "Signal available" proves ingest + path + HTTP reachability — nothing more.
- LiveCamera needs the **media path** to actually come up: remote SDP applied, ICE connected, track received, `play()` allowed.

The concrete gap in `LiveCamera`: the offer is POSTed immediately after `setLocalDescription`, before ICE gathering finishes, and no ICE candidates are ever sent afterwards (no WHEP `PATCH`/trickle). The server therefore only ever sees a candidate-less offer, ICE never pairs, `connectionState` goes `connecting -> failed`, the retry timer fires, and after 3 attempts the pane reports CONNECTION FAILED. Secondary contributors: `ontrack` assumes `event.streams[0]` exists, `play()` is never called after `srcObject` assignment, and a transient `disconnected` state immediately triggers a teardown + reconnect.

This diagnosis is based on code reading; step 1 below confirms it with real logs before the fix is judged complete.

## What will change

1. **Shared WHEP helper** in `src/lib/stream-paths.ts` — one function that creates the peer connection, gathers ICE (vanilla ICE: wait for `icegatheringstate === "complete"`, capped at ~2s), POSTs the offer, classifies the response (`201` / `404 no publisher` / `400 codec` / other), resolves the `Location` header against `window.location.origin`, and applies the answer. Both Test Connection and LiveCamera call it, so they cannot drift.
2. **Test Connection** keeps its behaviour: connect, classify, `DELETE` the resource, close the peer connection.
3. **LiveCamera** uses the same helper but *stays alive*: it keeps the peer connection and the resolved WHEP resource URL, and only DELETEs/closes on unmount or an explicit reconnect.
4. **Track handling**: `pc.ontrack` uses `event.streams?.[0] ?? new MediaStream([event.track])`, assigns `srcObject`, then calls `video.play()` and logs the rejection reason instead of silently failing.
5. **Autoplay**: the element starts `muted autoPlay playsInline` and plays without any user click; existing focus/audio-follow logic still unmutes later.
6. **State mapping** is corrected so CONNECTION FAILED is reserved for real failures:
   - CONNECTING: negotiating, ICE `new`/`checking`
   - LIVE: `connectionState === "connected"` and a track arrived
   - RECONNECTING: was live, connection dropped, retry pending (transient `disconnected` waits ~5s before counting as a drop)
   - NO VIDEO STREAMING: WHEP 404 / no publisher
   - CONNECTION FAILED: WHEP rejected, ICE permanently failed, or retries exhausted
7. **Single connection per instance**: a generation/attempt ID guards every async continuation so a stale attempt (including React StrictMode's double-invoke in dev) can never close the newer live connection. The connect effect depends only on `streamName` and `baseUrl`.
8. **Dev diagnostics** (`import.meta.env.DEV` only, no passphrases): request URL, POST status, non-2xx body, Location header, resolved resource URL, local/remote SDP set, ICE gathering + connection state, peer connection state, signaling state, ontrack fired, whether `streams[0]` existed, track `readyState`, and the `play()` result.

## Verification

Read the browser console against the running preview with Source 1 (`cam1`) publishing, and confirm: POST 201, remote SDP applied, `ontrack` fired, `play()` resolved, pane CONNECTING -> LIVE with visible video. Then stop the publisher (expect RECONNECTING / NO VIDEO STREAMING) and restart it (expect the same pane returns to LIVE). Report back the exact failure reason observed, whether `event.streams[0]` existed, the `play()` result, the final peer connection state, and the files changed. Stop after Source 1 works.

## Files touched

- `src/lib/stream-paths.ts` (shared WHEP negotiation helper; `probeStream` refactored onto it)
- `src/components/LiveCamera.tsx` (persistent session, track handling, state machine, diagnostics)

No changes to SRT config, MediaMTX, UI design, Quinn, Timeline, Ops, sharing, or session behaviour.
