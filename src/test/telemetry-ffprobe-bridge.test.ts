import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseFrameRate,
  snapshotFromProbe,
  videoFromProbe,
  outputAudioFromProbe,
  type MediaProbePayload,
} from "@/lib/telemetry/media-metadata";
import {
  MediaTelemetryBridgeProvider,
  MEDIA_PROBE_RETRY_DELAYS_MS,
  type MediaProbeResult,
} from "@/lib/telemetry/provider";
import { authorizeRouteTelemetry, type RouteReader, type RuntimeRouteRow } from "../../supabase/functions/media-telemetry/authorize";

const identity = {
  runtimeRouteId: "11111111-1111-4111-8111-111111111111",
  sessionId: "sess-TEST",
  slot: 1,
  infrastructureSourceId: "src_a241b4",
  playbackPath: "src_a241b4-opus",
};

const payload = (over: Partial<MediaProbePayload> = {}): MediaProbePayload => ({
  source_id: "src_a241b4",
  playback_path: "src_a241b4-opus",
  observed_at: new Date().toISOString(),
  observation_point: "rtsp_publication",
  video: {
    codec: "h264",
    profile: "High",
    width: 1920,
    height: 1080,
    frame_rate: "30000/1001",
    field_order: "progressive",
    color_space: "bt709",
  },
  audio_output: { codec: "opus", sample_rate: 48000, channels: 2, channel_layout: "stereo" },
  ...over,
});

describe("Phase E.2B — frame-rate normalization", () => {
  it("parses 30/1 as exactly 30", () => {
    expect(parseFrameRate("30/1")).toBe(30);
  });

  it("keeps 30000/1001 at its true value and never rounds it to 30", () => {
    const fps = parseFrameRate("30000/1001");
    expect(fps).toBe(29.97);
    expect(fps).not.toBe(30);
  });

  it("keeps 60000/1001 at 59.94", () => {
    expect(parseFrameRate("60000/1001")).toBe(59.94);
  });

  it("returns null for unparseable, zero-denominator and empty values", () => {
    expect(parseFrameRate("0/0")).toBeNull();
    expect(parseFrameRate("N/A")).toBeNull();
    expect(parseFrameRate("")).toBeNull();
    expect(parseFrameRate(null)).toBeNull();
    expect(parseFrameRate(undefined)).toBeNull();
  });
});

describe("Phase E.2B — mapping a genuine probe onto the contract", () => {
  it("maps observed video with ffmpeg provenance", () => {
    const snap = snapshotFromProbe({ identity, payload: payload() });
    expect(snap.video.codec.value).toBe("h264");
    expect(snap.video.codecProfile.value).toBe("High");
    expect(snap.video.width.value).toBe(1920);
    expect(snap.video.height.value).toBe(1080);
    expect(snap.video.frameRate.value).toBe(29.97);
    expect(snap.video.scanType.value).toBe("progressive");
    expect(snap.video.colorSpace.value).toBe("bt709");
    expect(snap.video.codec.source).toBe("ffmpeg");
  });

  it("records the observation point as MAKO's RTSP publication", () => {
    expect(snapshotFromProbe({ identity, payload: payload() }).observationPoint).toBe(
      "rtsp_publication",
    );
  });

  it("puts the observed Opus audio in output audio only and leaves source audio unavailable", () => {
    const snap = snapshotFromProbe({ identity, payload: payload() });
    expect(snap.audioOutput.outputAudioCodec.value).toBe("opus");
    expect(snap.audioOutput.outputAudioSampleRate.value).toBe(48000);
    expect(snap.audioOutput.outputAudioChannels.value).toBe(2);
    expect(snap.audioSource.codec.status).toBe("unavailable");
    expect(snap.audioSource.sampleRate.value).toBeNull();
  });

  it("never presents an observed publication bitrate as MAKO's configured bitrate", () => {
    const snap = snapshotFromProbe({ identity, payload: payload() });
    expect(snap.audioOutput.configuredOutputAudioBitrate.status).toBe("unavailable");
  });

  it("leaves missing fields unavailable instead of defaulting them", () => {
    const snap = snapshotFromProbe({
      identity,
      payload: payload({ video: { codec: "h264" } }),
    });
    expect(snap.video.codec.value).toBe("h264");
    expect(snap.video.width.status).toBe("unavailable");
    expect(snap.video.frameRate.status).toBe("unavailable");
    expect(snap.video.scanType.status).toBe("unavailable");
  });

  it("does not fabricate audio for a video-only publication", () => {
    const snap = snapshotFromProbe({ identity, payload: payload({ audio_output: null }) });
    expect(snap.audioOutput.outputAudioCodec.status).toBe("unavailable");
  });

  it("does not fabricate video for an audio-only publication", () => {
    const snap = snapshotFromProbe({ identity, payload: payload({ video: null }) });
    expect(snap.video.codec.status).toBe("unavailable");
    expect(snap.audioOutput.outputAudioCodec.value).toBe("opus");
  });

  it("ignores unknown field_order and color_space rather than inventing a value", () => {
    const v = videoFromProbe(
      { codec: "h264", field_order: "unknown", color_space: "unknown" },
      new Date().toISOString(),
    );
    expect(v.scanType.status).toBe("unavailable");
    expect(v.colorSpace.status).toBe("unavailable");
  });

  it("rejects non-positive numeric audio values", () => {
    const a = outputAudioFromProbe({ codec: "opus", sample_rate: 0, channels: 0 }, new Date().toISOString());
    expect(a.outputAudioSampleRate.status).toBe("unavailable");
    expect(a.outputAudioChannels.status).toBe("unavailable");
  });

  it("leaves transport and receiver untouched (not measured)", () => {
    const snap = snapshotFromProbe({ identity, payload: payload() });
    expect(snap.transport.bitrate.status).toBe("not_measured");
    expect(snap.transport.packetLoss.status).toBe("not_measured");
    expect(snap.transport.rtt.status).toBe("not_measured");
    expect(snap.receiver.framesDecoded.status).toBe("not_measured");
  });

  it("keeps the canonical runtime route identity and never a camN path", () => {
    const snap = snapshotFromProbe({ identity, payload: payload() });
    expect(snap.runtimeRouteId).toBe(identity.runtimeRouteId);
    expect(snap.playbackPath).toBe("src_a241b4-opus");
    expect(JSON.stringify(snap)).not.toMatch(/cam\d/);
  });
});

describe("Phase E.2B — bridge provider", () => {
  const ok: MediaProbeResult = { ok: true, payload: payload() };

  it("addresses the bridge by runtime route id, not by src_xxxxxx", async () => {
    const seen: string[] = [];
    const p = new MediaTelemetryBridgeProvider(async (id) => {
      seen.push(id);
      return ok;
    });
    await p.getMediaMetadata(identity);
    expect(seen).toEqual([identity.runtimeRouteId]);
  });

  it("returns unavailable groups with a typed failure code when the probe fails", async () => {
    const p = new MediaTelemetryBridgeProvider(async () => ({
      ok: false,
      code: "telemetry_unavailable",
    }));
    const r = await p.getMediaMetadata(identity);
    expect(r.failure).toBe("telemetry_unavailable");
    expect(r.video.codec.status).toBe("unavailable");
    expect(r.audioOutput.outputAudioCodec.status).toBe("unavailable");
  });

  it("contains a thrown transport error as upstream_error", async () => {
    const p = new MediaTelemetryBridgeProvider(async () => {
      throw new Error("network down");
    });
    const r = await p.getMediaMetadata(identity);
    expect(r.failure).toBe("upstream_error");
  });

  it("keeps transport and receiver not measured", async () => {
    const p = new MediaTelemetryBridgeProvider(async () => ok);
    expect((await p.getTransportTelemetry()).bitrate.status).toBe("not_measured");
    expect((await p.getReceiverTelemetry()).jitter.status).toBe("not_measured");
  });

  it("uses a bounded retry schedule, not high-frequency polling", () => {
    expect([...MEDIA_PROBE_RETRY_DELAYS_MS]).toEqual([2000, 4000]);
    const hook = readFileSync("src/hooks/use-media-telemetry.ts", "utf8");
    expect(hook).not.toMatch(/setInterval/);
  });
});

describe("Phase E.2B — server-side authorization", () => {
  const route: RuntimeRouteRow = {
    id: identity.runtimeRouteId,
    session_id: "sess-TEST",
    owner_id: "owner-1",
    slot: 1,
    infrastructure_source_id: "src_a241b4",
    playback_path: "src_a241b4-opus",
    lifecycle_status: "ready",
  };

  const reader = (over: Partial<RouteReader> = {}, r: RuntimeRouteRow | null = route): RouteReader => ({
    getRoute: async () => r,
    hasSharedAccess: async () => false,
    ...over,
  });

  it("refuses an unauthenticated request", async () => {
    const res = await authorizeRouteTelemetry(reader(), null, identity.runtimeRouteId);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe("unauthorized");
  });

  it("allows the session owner", async () => {
    const res = await authorizeRouteTelemetry(reader(), "owner-1", identity.runtimeRouteId);
    expect(res.ok).toBe(true);
    expect(res.ok && res.sourceId).toBe("src_a241b4");
  });

  it("allows an anonymous Temporary Operator that owns the session", async () => {
    const guestRoute = { ...route, owner_id: "guest-abc" };
    const res = await authorizeRouteTelemetry(reader({}, guestRoute), "guest-abc", identity.runtimeRouteId);
    expect(res.ok).toBe(true);
  });

  it("allows a collaborator with a non-revoked share grant", async () => {
    const res = await authorizeRouteTelemetry(
      reader({ hasSharedAccess: async () => true }),
      "other-user",
      identity.runtimeRouteId,
    );
    expect(res.ok).toBe(true);
  });

  it("refuses an unrelated user without leaking that the route exists", async () => {
    const res = await authorizeRouteTelemetry(reader(), "stranger", identity.runtimeRouteId);
    expect(res.ok === false && res.error).toBe("not_found");
  });

  it("rejects a non-UUID route id, so src_xxxxxx grants nothing", async () => {
    const res = await authorizeRouteTelemetry(reader(), "owner-1", "src_a241b4");
    expect(res.ok === false && res.error).toBe("not_found");
  });

  it("reports a route without infrastructure identity as telemetry_unavailable, not a fault", async () => {
    const res = await authorizeRouteTelemetry(
      reader({}, { ...route, infrastructure_source_id: null, playback_path: null }),
      "owner-1",
      identity.runtimeRouteId,
    );
    expect(res.ok === false && res.error).toBe("telemetry_unavailable");
    expect(res.ok === false && res.status).toBe(200);
  });

  it("rejects a malformed infrastructure source id", async () => {
    const res = await authorizeRouteTelemetry(
      reader({}, { ...route, infrastructure_source_id: "src_../../etc" }),
      "owner-1",
      identity.runtimeRouteId,
    );
    expect(res.ok === false && res.error).toBe("telemetry_unavailable");
  });
});

describe("Phase E.2B — input hardening and secret containment", () => {
  const fn = readFileSync("supabase/functions/media-telemetry/index.ts", "utf8");

  it("accepts only runtime_route_id from the client — no URL, host, path or ffprobe args", () => {
    expect(fn).toMatch(/runtime_route_id: z\.string\(\)/);
    expect(fn).not.toMatch(/rtsp:\/\//);
    expect(fn).not.toMatch(/remote_host|remote_port/);
  });

  it("derives the upstream path from the trusted stored source id", () => {
    expect(fn).toMatch(/\/pull-sources\/\$\{auth\.sourceId\}\/telemetry\/media/);
  });

  it("keeps MAKO_API_TOKEN server-side and never returns raw upstream text", () => {
    expect(fn).toMatch(/MAKO_API_TOKEN/);
    const client = readFileSync("src/hooks/use-media-telemetry.ts", "utf8");
    expect(client).not.toMatch(/Deno\.env|api\.makosrt\.com|Authorization: `Bearer/);
    expect(fn).not.toMatch(/body: text|telemetry: parsed[^.]/);
  });

  it("never writes to the database or touches lifecycle from the telemetry read", () => {
    expect(fn).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  });
});
