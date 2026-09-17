import { describe, it, expect } from "vitest";
import {
  emptySnapshot,
  freshness,
  hasValue,
  observed,
  snapshotForRoute,
  TELEMETRY_STALE_AFTER_MS,
  type MediaTelemetrySnapshot,
} from "@/lib/telemetry/contract";
import {
  NullTelemetryProvider,
  outputAudioFromConfig,
  snapshotFromMetadata,
} from "@/lib/telemetry/provider";
import { parseFfmpegMetadata } from "../../supabase/functions/_shared/ffmpeg-metadata";

const identity = {
  runtimeRouteId: "ec1ef3b8-e889-45fb-80ad-6347aced9a78",
  sessionId: "sess-TEST",
  slot: 1,
  infrastructureSourceId: "src_a241b4",
  playbackPath: "src_a241b4-opus",
};

const banner = `
Input #0, mpegts, from 'srt://174.166.29.128:8000?mode=caller':
  Duration: N/A, start: 1.400000, bitrate: N/A
  Stream #0:0[0x100]: Video: h264 (High), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 59.94 fps, 59.94 tbr
  Stream #0:1[0x101]: Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s
`;

describe("Phase E.2 — telemetry contract identity and provenance", () => {
  it("is keyed by runtime route id, not slot or label", () => {
    const a = emptySnapshot(identity);
    const b = emptySnapshot({ ...identity, runtimeRouteId: "other-route", slot: 1 });
    expect(snapshotForRoute([a, b], identity.runtimeRouteId)).toBe(a);
    expect(snapshotForRoute([a, b], "unknown-route")).toBeNull();
    expect(snapshotForRoute([a, b], null)).toBeNull();
  });

  it("an identity-only snapshot invents no values", () => {
    const snap = emptySnapshot(identity);
    const groups = [snap.video, snap.audioSource, snap.audioOutput, snap.receiver];
    for (const group of groups) {
      for (const field of Object.values(group)) {
        expect(field.value).toBeNull();
        expect(field.status === "unavailable" || field.status === "not_measured").toBe(true);
        expect(field.source).toBeNull();
      }
    }
    expect(snap.observedAt).toBeNull();
    expect(snap.infrastructureSourceId).toBe("src_a241b4");
    expect(snap.playbackPath).toBe("src_a241b4-opus");
  });

  it("transport and receiver are explicitly not measured in E.2", () => {
    const snap = emptySnapshot(identity);
    expect(snap.transport.bitrate.status).toBe("not_measured");
    expect(snap.transport.packetLoss.status).toBe("not_measured");
    expect(snap.transport.rtt.status).toBe("not_measured");
    expect(snap.receiver.framesDecoded.status).toBe("not_measured");
  });

  it("configured receiver latency is configuration and never becomes RTT", () => {
    const snap = snapshotFromMetadata({
      identity,
      parsed: parseFfmpegMetadata(banner),
      observedAt: new Date().toISOString(),
      configuredReceiverLatencyUs: 120000,
    });
    expect(snap.transport.configuredReceiverLatencyUs.value).toBe(120000);
    expect(snap.transport.configuredReceiverLatencyUs.source).toBe("mako_config");
    expect(snap.transport.rtt.value).toBeNull();
    expect(snap.transport.rtt.source).toBeNull();
  });

  it("keeps source audio separate from MAKO output audio", () => {
    const snap = snapshotFromMetadata({
      identity,
      parsed: parseFfmpegMetadata(banner),
      observedAt: new Date().toISOString(),
      outputConfig: {
        audioCodec: "opus",
        audioSampleRate: 48000,
        audioChannels: 2,
        audioBitrate: 128000,
      },
    });
    expect(snap.audioSource.codec.value).toBe("aac (LC)");
    expect(snap.audioSource.codec.source).toBe("ffmpeg");
    expect(snap.audioOutput.outputAudioCodec.value).toBe("opus");
    expect(snap.audioOutput.outputAudioCodec.source).toBe("mako_config");
    expect(snap.audioOutput.configuredOutputAudioBitrate.source).toBe("mako_config");
  });

  it("output audio stays unavailable when configuration is unknown", () => {
    const out = outputAudioFromConfig(null, new Date().toISOString());
    expect(out.outputAudioCodec.status).toBe("unavailable");
    expect(out.configuredOutputAudioBitrate.value).toBeNull();
  });

  it("downgrades observations that are no longer fresh", () => {
    const old = new Date(Date.now() - TELEMETRY_STALE_AFTER_MS - 5_000).toISOString();
    const snap: MediaTelemetrySnapshot = {
      ...emptySnapshot(identity),
      video: { ...emptySnapshot(identity).video, codec: observed("h264", "ffmpeg", old) },
    };
    const marked = freshness(snap);
    expect(marked.video.codec.status).toBe("stale");
    expect(marked.video.codec.value).toBe("h264");
    expect(hasValue(marked.video.codec)).toBe(false);
  });

  it("the shipped provider reports nothing measured", async () => {
    const p = new NullTelemetryProvider();
    const media = await p.getMediaMetadata();
    expect(Object.values(media.video).every((f) => f.value === null)).toBe(true);
    expect(Object.values(media.audioSource).every((f) => f.value === null)).toBe(true);
    const t = await p.getTransportTelemetry();
    expect(t.bitrate.status).toBe("not_measured");
  });
});

describe("Phase E.2 — FFmpeg metadata parser", () => {
  it("parses genuine production banner output", () => {
    const parsed = parseFfmpegMetadata(banner);
    expect(parsed.video).toEqual({
      codec: "h264",
      codecProfile: "High",
      width: 1920,
      height: 1080,
      frameRate: 59.94,
      scanType: "progressive",
      colorSpace: "bt709",
    });
    expect(parsed.audio).toMatchObject({
      codec: "aac",
      codecProfile: "LC",
      sampleRate: 48000,
      channelLayout: "stereo",
      channelCount: 2,
      encodedBitrate: 192000,
    });
  });

  it("returns nothing for empty, malformed or non-string input", () => {
    expect(parseFfmpegMetadata("")).toEqual({});
    expect(parseFfmpegMetadata(undefined)).toEqual({});
    expect(parseFfmpegMetadata(null)).toEqual({});
    expect(parseFfmpegMetadata(12345)).toEqual({});
    expect(parseFfmpegMetadata("Input #0, mpegts, from 'srt://x'")).toEqual({});
  });

  it("handles audio-listed-first, video-only and audio-only inputs", () => {
    const reversed = parseFfmpegMetadata(
      "Stream #0:0: Audio: opus, 48000 Hz, mono\nStream #0:1: Video: hevc, 1280x720, 25 fps",
    );
    expect(reversed.audio?.codec).toBe("opus");
    expect(reversed.audio?.channelCount).toBe(1);
    expect(reversed.video?.codec).toBe("hevc");
    expect(reversed.video?.width).toBe(1280);

    const videoOnly = parseFfmpegMetadata("Stream #0:0: Video: mpeg2video, 720x576, 25 fps");
    expect(videoOnly.audio).toBeUndefined();

    const audioOnly = parseFfmpegMetadata("Stream #0:0: Audio: mp2, 44100 Hz, stereo");
    expect(audioOnly.video).toBeUndefined();
  });

  it("omits fields the banner does not report instead of defaulting them", () => {
    const sparse = parseFfmpegMetadata("Stream #0:0: Video: h264, 1920x1080");
    expect(sparse.video?.frameRate).toBeUndefined();
    expect(sparse.video?.scanType).toBeUndefined();
    expect(sparse.video?.colorSpace).toBeUndefined();
    expect(sparse.video?.codecProfile).toBeUndefined();

    const noBitrate = parseFfmpegMetadata("Stream #0:1: Audio: aac, 48000 Hz, stereo");
    expect(noBitrate.audio?.encodedBitrate).toBeUndefined();
  });

  it("tolerates unknown codecs and interlaced scan", () => {
    const odd = parseFfmpegMetadata(
      "Stream #0:0[0x1e0]: Video: someunknowncodec (Main 10), yuv422p10le(tv, smpte170m, interlaced), 1920x1080, 29.97 fps",
    );
    expect(odd.video?.codec).toBe("someunknowncodec");
    expect(odd.video?.codecProfile).toBe("Main 10");
    expect(odd.video?.scanType).toBe("interlaced");
    expect(odd.video?.colorSpace).toBe("smpte170m");
    expect(odd.video?.frameRate).toBe(29.97);
  });
});
