# Post-Phase-5 UX Correction Audit — Address + Port First

Read-only audit. Nothing was changed. Every claim below is traced to code in this repo; where the answer lives in infrastructure outside the repo (the MAKO ingest FastAPI manager, FFmpeg/systemd, MediaMTX config), that is stated explicitly rather than guessed.

## 1. What Address + Port actually do today

Traced path: `CreateSession.tsx` → `SrtLine` in `session-store.ts` → `inputsFromRecord` in `stream-paths.ts` → `SignalTile`/`LiveCamera` → `negotiateWhep`.

- The typed address and port are joined by `composeSrt` into one string on `SrtLine.srtAddress` and stored in the session record (localStorage plus `sessions.payload.lines`). Nothing else stores them.
- `inputsFromRecord` for a manual slot only checks that host and port are non-empty (`lineHasEndpoint`), then sets `streamName = camN` (`streamNameForSlot(slot)`) and puts `srt://host:port` into a **display-only** `srtAddress` field.
- Playback URL is `<WHEP base>/camN-opus/whep`. The comment at the top of `stream-paths.ts` states this outright: the typed address "is never used to build the browser playback URL".
- `Test Connection` calls `probeStream(streamNameForSlot(slot))` — it probes `camN`, not the typed address.
- The typed values are never sent to `mako-ingest` (its request schema accepts only `action`, `name`, `source_id`), never sent to `save-session` as anything but opaque payload, and there is no code anywhere that forwards them to FFmpeg, MediaMTX, or the ingest manager.

**Conclusion:** today the entered IP and port have zero effect on media transport. They are documentation. A manual slot resolves to the shared global `camN-opus` path, whatever address was typed.

## 2. SRT mode

- `SrtMode = "caller" | "listener"` exists in `session-store.ts`, defaults to `"caller"`, and `CreateSession` force-normalizes every enabled line to `mode: "caller"` on save. Nothing reads `mode` afterwards — no branch in playback, no branch in any Edge Function.
- The wording in the UI ("Set the encoder Stream ID to `publish:camN` in caller mode") describes **model B**: the external encoder is the SRT caller and MAKO/MediaMTX is the listener on `:8890`.
- Phase 4/5 sources are also model B: the encoder calls `stream.makosrt.com:<dedicated port>`.
- Model A (MAKO dials out to `external-ip:port` as SRT caller) is **not implemented anywhere** in this repo, and nothing here shows the ingest manager supports it — the only upstream call is `POST /sources {name}`, with no address field. Whether the manager could pull from an arbitrary upstream is outside this repo and must be confirmed against the FastAPI service.

So the Address + Port fields read like model A while the infrastructure is model B. That mismatch is the real bug behind this audit: the fields imply "MAKO will connect here", and MAKO never does.

## 3. Current ingest architecture (what the repo proves)

- `mako-ingest` Edge Function is the only bridge. `create_source` reserves a quota slot (`reserve_ingest_source_slot`), POSTs `/sources {name}` to the private API, validates the reply against `^src_[a-f0-9]{6}$`, port 10020–10999, and `output_path === "<source_id>-opus"`, then finalizes the `ingest_sources` row as `ready`.
- The **dedicated SRT listener and its port are created upstream**, by the manager, in response to `POST /sources`. The port comes back in the response; MAKO never chooses it.
- FFmpeg's role is documented in `stream-paths.ts`: per source it copies H.264 and re-encodes AAC to Opus into `<name>-opus`. That service lives in infrastructure, not this repo.
- `playback_path` is exactly the upstream `output_path` (`src_xxxxxx-opus`), snapshotted onto `session_sources` at attach time.
- **Arbitrary upstream IP + port is not supported by the current contract.** The only creation verb is "make me a listener with this name".

## 4. Could Start Monitoring auto-create the internal source?

Conceptually yes, and most of the machinery already exists:

- `createSource()` in `create-source.ts` is already runtime-agnostic and already implements reserve → provision → validate → finalize with release/compensation on every failure branch. It could be reused as-is for auto-creation.
- `save_session_with_sources` already persists session + attachments atomically and already derives label and `playback_path` server-side from the owner's own row.

The hard part is that provisioning is an external side effect and cannot join the database transaction. So the only safe ordering is: **provision first, persist second, compensate the provisioning if persistence fails.** If provisioning succeeds and the session save fails, the newly created infrastructure must be deleted (the same `deleteUpstream` compensation already used) and the reservation row released, or MAKO leaks a listener and a quota slot.

Whether auto-created routes are persistent or session-scoped, and whether they appear in My Sources, is a product decision — addressed in section 5.

Important caveat: auto-creating a listener does **not** honour a typed external IP + port. It gives the operator a MAKO destination. If the true intent is "MAKO pulls from my encoder at this address", that capability does not exist yet in the manager and is a separate infrastructure workstream.

## 5. Do we need ingest_sources for direct input?

| | A: auto-create persistent source | B: separate session-scoped route table | C: extend ingest_sources with a session-scoped kind | D: keep manual slots on legacy camN |
|---|---|---|---|---|
| Operator UX | Name + Start; a source silently appears in My Sources | Name + Start; nothing appears | Name + Start; optionally saveable later | Unchanged (and still broken/shared) |
| Backend complexity | Lowest — reuses everything | Highest — second registry, second delete path, second RLS set | Low — one nullable `kind`/`session_scoped` flag | None |
| Cleanup | Manual (operator deletes) | Automatic on session end | Automatic for session-scoped rows only | N/A |
| Multi-user isolation | Already proven (owner_id + RLS) | New policies to write | Already proven | Broken — everyone shares camN |
| Four feeds in one session | Four distinct ports/paths | Four distinct | Four distinct | Collides |
| Playback / collaborator | Phase 5 resolver unchanged | Needs a second snapshot path | Unchanged | Legacy only |
| Failure handling | Existing compensation | New compensation | Existing compensation | N/A |
| Preserves Phase 5 | Yes | Partly | Yes | Yes but pointless |
| Orphan infrastructure risk | Low | Medium | Low | None |
| Counts toward 4-source quota | Yes (bad) | No | Configurable (good) | No |

**Recommendation: Option C.** One additive column on `ingest_sources` distinguishing a persistent library source from a session-scoped route. Everything Phase 5 built keeps working untouched, cleanup and quota become policy rather than new architecture, and My Sources simply filters to persistent rows.

## 6. Role of /sources

Not technically required once Create Session can provision on demand. Recommend keeping it, renamed to **Saved Inputs**, as an optional convenience: reusable named destinations for recurring contributors. Not in the primary flow; leave it in navigation for now, demote later once direct input ships.

## 7. Address Book vs Sources vs session inputs

Three overlapping concepts today. Simplify to two:

- **Source** = one feed inside a session (slot 1–4). The only term in the main flow.
- **Saved Input** = an optional saved Source you can recall (this absorbs today's Address Book and today's My Sources).

Retire "Address Book" and "My Sources" as operator-facing words.

## 8. Smallest Create Session UI correction

Keep the page structure. Per slot, in this order: Friendly Name → SRT Address / IP → Port → Notes → Advanced → Test Connection. The My Sources panel moves out of the primary column into a single small "Use a saved input" link/menu next to the slot header — available, never required. `Save Source` becomes `Save as Saved Input`.

If SRT mode must surface, put it under Advanced with operator wording, not protocol wording:
- "My encoder sends to MAKO" (current, default)
- "MAKO connects to my device" (only when the manager supports it)

## 9. Dynamic playback is preserved

The recommendation changes only how a route comes into existence. `session_sources.playback_path`, `inputsFromRecord`, SessionRoom, both popouts, collaborator-safe metadata, audio selection, and attachment lifecycle are untouched. `camN` stays as legacy compatibility for sessions saved before this change; new sessions never depend on it.

## 10. Failure ordering

Correct sequence: validate input → provision route (external) → atomic session + attachment save → open Session Room.

- Validation fails: nothing created, inline error.
- Provisioning fails: reservation released, no session created, operator sees a plain "couldn't prepare the feed" message.
- Session or attachment save fails: both are one transaction, so they fail together; compensate by deleting the just-provisioned route and releasing the reservation.
- Browser closes mid-flow: a `provisioning` row with no attachment can be reaped by a later sweep; that reaper does not exist yet and belongs on the LATER list.

## 11. Session end

Today ending a session stamps `detached_at` and deliberately leaves the source alive. For session-scoped routes: paused → keep the route; completed → detach and release the route; archived → already released. Persistent Saved Inputs keep today's behaviour exactly.

## 12. Reuse of the same address tomorrow

Recommend: always create a fresh session-scoped route, and offer Saved Input recall for the name/notes only. Reusing yesterday's infrastructure implicitly is the most confusing option and the easiest to get wrong when two sessions overlap. A persistent Saved Input is reused only when explicitly chosen.

## 13. Security

The recommendation keeps every existing guarantee, because it changes no identity path: `owner_id` still comes from the verified JWT, `save_session_with_sources` is service-role-only and requires `owner_id = _owner` with no admin bypass, `playback_path` and `infrastructure_source_id` are still derived server-side from the owner's own row, and collaborators still read only viewer-safe `session_sources` columns. A browser can still forge nothing.

## 14. Quota

Session-scoped routes should **not** count toward the four persistent Saved Inputs. They do need their own cap (a per-owner limit on concurrent session-scoped routes) or one operator can exhaust the port range. The existing advisory-lock reservation function is the right mechanism; it needs a scope argument.

## 15. Phase 5 KEEP list

Keep all of it: `session_sources`, the `playback_path` snapshot, the dynamic `inputsFromRecord` resolver, the active-only partial unique indexes, collaborator-safe playback, atomic session+attachment persistence, `detached_at` lifecycle, legacy `camN` fallback, popout handling, audio handling.

## 16. CHANGE list

1. Additive `ingest_sources` flag distinguishing persistent vs session-scoped routes.
2. A server action that provisions a session-scoped route for a slot, reusing `createSource` and its compensation.
3. Start Monitoring provisions then saves atomically, with rollback.
4. Create Session UI reordered to Name + Address + Port first; saved inputs demoted to optional.
5. Session completion releases session-scoped routes.
6. Separate cap for session-scoped routes; persistent quota untouched.
7. Terminology: Source / Saved Input.

## 17. Final recommendation

```text
OPERATOR
  Create Session
    -> Friendly Name
    -> SRT Address / IP
    -> Port
    -> Start Monitoring

MAKO INTERNAL
  -> provision session-scoped ingest route (reuses create_source + compensation)
  -> dynamic playback identity (src_xxxxxx-opus)
  -> atomic session + session_sources attachment
  -> SessionRoom / popouts resolve playback from the attachment snapshot
```

Sources/My Sources survives as **Saved Inputs**: an optional library for recurring contributors, plus admin/internal infrastructure visibility. It is never a prerequisite for starting a session.

One thing to settle before implementation: the typed Address + Port still has no transport meaning under this recommendation unless the ingest manager can pull from an arbitrary upstream. Either the fields become "where your encoder should send" (MAKO shows the destination, operator does not type it), or the manager gains a pull mode. That decision shapes the UI copy.

## 18. Implementation boundary

- **REQUIRED:** items 1–4 and 6 of the CHANGE list.
- **OPTIONAL:** terminology rename, Saved Input recall in Create Session.
- **LATER:** orphan/`provisioning`-row reaper, SRT pull mode if the manager gains it, retiring legacy `camN`, /sources repositioning or removal.
- **OUT OF SCOPE:** RLS broadening, admin bypass, playback resolver rewrite, MediaMTX/FFmpeg changes, sharing and collaborator model, Phase 5 rollback.

Nothing has been implemented. Approve only if you want this recorded as the direction; the actual work would be a separate phase plan.
