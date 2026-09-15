// Phase 5 — playback resolution and attachment intent.
//
// Pure-function tests: no network, no database, no MAKO infrastructure.

import { describe, it, expect } from "vitest";
import { inputsFromRecord, playbackStreamName } from "@/lib/stream-paths";
import { attachmentIntents, isSourceBacked } from "@/lib/session-attachments";
import { createDefaultLine, parseSrtInput, type SessionRecord, type SrtLine } from "@/lib/session-store";

const line = (patch: Partial<SrtLine>): SrtLine => ({
  ...createDefaultLine(patch.id ?? 1),
  enabled: true,
  ...patch,
});

const record = (lines: SrtLine[], extra: Partial<SessionRecord> = {}): SessionRecord =>
  ({
    id: "sess-1",
    name: "Test",
    status: "active",
    pin: "1234",
    createdAt: new Date().toISOString(),
    host: "Op",
    hostUserId: "u1",
    defaultOriginTimeZone: "UTC",
    lines,
    notes: [],
    markers: [],
    ...extra,
  }) as SessionRecord;

const attachment = (slot: number, path: string, label: string | null = null) => ({
  slot,
  label,
  playbackPath: path,
  ingestSourceId: `uuid-${slot}`,
  attachedAt: new Date().toISOString(),
});

describe("playback resolution", () => {
  it("uses the attachment playback path for a persistent source", () => {
    const r = record([line({ id: 1, sourceKind: "mako", ingestSourceId: "uuid-1" })], {
      attachments: [attachment(1, "src_250420-opus", "Truck A")],
      attachmentsLoaded: true,
    });
    const [input] = inputsFromRecord(r, parseSrtInput);
    expect(input.streamName).toBe("src_250420-opus");
    expect(input.label).toBe("Source 1 — Truck A");
  });

  it("keeps the legacy camN mapping for a manual address slot", () => {
    const r = record([line({ id: 2, srtAddress: "srt://1.2.3.4:8890" })], {
      attachmentsLoaded: true,
    });
    const [input] = inputsFromRecord(r, parseSrtInput);
    expect(input.streamName).toBe("cam2");
  });

  it("never falls back to camN while attachments are still loading", () => {
    const r = record([line({ id: 1, sourceKind: "mako", ingestSourceId: "uuid-1" })], {
      attachments: [],
      attachmentsLoaded: false,
    });
    const [input] = inputsFromRecord(r, parseSrtInput);
    expect(input.streamName).toBeUndefined();
    expect(input.status).toBe("connecting");
  });

  it("drops a source-backed slot once loading shows it detached", () => {
    const r = record([line({ id: 1, sourceKind: "mako", ingestSourceId: "uuid-1" })], {
      attachments: [],
      attachmentsLoaded: true,
    });
    expect(inputsFromRecord(r, parseSrtInput)).toHaveLength(0);
  });

  it("does not double-suffix an already-opus playback path", () => {
    expect(playbackStreamName("src_250420-opus")).toBe("src_250420-opus");
  });

  it("resolves mixed persistent and legacy slots independently", () => {
    const r = record(
      [
        line({ id: 1, sourceKind: "mako", ingestSourceId: "uuid-1" }),
        line({ id: 2, srtAddress: "srt://1.2.3.4:8890" }),
      ],
      { attachments: [attachment(1, "src_aa1122-opus")], attachmentsLoaded: true },
    );
    expect(inputsFromRecord(r, parseSrtInput).map((i) => i.streamName)).toEqual([
      "src_aa1122-opus",
      "cam2",
    ]);
  });
});

describe("attachment intent", () => {
  it("sends only slot, source id and a real custom label", () => {
    const intents = attachmentIntents([
      line({ id: 1, sourceKind: "mako", ingestSourceId: "uuid-1", label: "Truck A" }),
      line({ id: 2, sourceKind: "mako", ingestSourceId: "uuid-2", label: "Line 2" }),
    ]);
    expect(intents).toEqual([
      { slot: 1, ingest_source_id: "uuid-1", label: "Truck A" },
      { slot: 2, ingest_source_id: "uuid-2" },
    ]);
  });

  it("excludes disabled and manual slots", () => {
    const intents = attachmentIntents([
      line({ id: 1, srtAddress: "srt://1.2.3.4:8890" }),
      line({ id: 2, enabled: false, sourceKind: "mako", ingestSourceId: "uuid-2" }),
    ]);
    expect(intents).toEqual([]);
  });

  it("recognises source-backed slots only with both marker and id", () => {
    expect(isSourceBacked(line({ sourceKind: "mako", ingestSourceId: "uuid-1" }))).toBe(true);
    expect(isSourceBacked(line({ sourceKind: "mako" }))).toBe(false);
    expect(isSourceBacked(line({ ingestSourceId: "uuid-1" }))).toBe(false);
  });
});
