// Phase E.5B — deterministic tests for the audio-silence detector and its
// persistence reporter. No fake telemetry: every measurement below is a
// hand-written E.3-shaped snapshot with explicit status and provenance.

import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_SILENCE_DETECTOR_CONFIG,
  initialAudioSilenceState,
  stepAudioSilenceDetector,
  type AudioSilenceConfig,
  type AudioSilenceDetectorState,
  type AudioSilenceIntent,
} from "@/lib/incidents/audio-silence-detector";
import {
  AudioSilenceReporter,
  type AudioSilenceReporterDeps,
} from "@/lib/incidents/audio-silence-reporter";
import { buildAudioLevelEvidence } from "@/lib/incidents/audio-silence-evidence";
import {
  notMeasuredAudio,
  unavailableAudio,
  type BrowserAudioLevelSnapshot,
} from "@/lib/telemetry/browser-audio-contract";
import type { IncidentSubmission } from "@/lib/incidents/contract";

const cfg = AUDIO_SILENCE_DETECTOR_CONFIG;

function mono(rmsDbfs: number, atMs: number): BrowserAudioLevelSnapshot {
  return {
    observationPoint: "browser_webrtc_pcm",
    observedAt: new Date(atMs).toISOString(),
    status: "observed",
    channelMode: "mono",
    mono: { rms: 0, rmsDbfs, peak: 0, peakDbfs: rmsDbfs + 2 },
  };
}

function stereo(l: number, r: number, atMs: number): BrowserAudioLevelSnapshot {
  return {
    observationPoint: "browser_webrtc_pcm",
    observedAt: new Date(atMs).toISOString(),
    status: "observed",
    channelMode: "stereo",
    left: { rms: 0, rmsDbfs: l, peak: 0, peakDbfs: l + 1 },
    right: { rms: 0, rmsDbfs: r, peak: 0, peakDbfs: r + 1 },
  };
}

/** Feed a series of [dBFS | snapshot, timeMs] observations. */
function run(
  series: Array<[BrowserAudioLevelSnapshot, number]>,
  config: AudioSilenceConfig = cfg,
  start: AudioSilenceDetectorState = initialAudioSilenceState(),
) {
  let state = start;
  const intents: AudioSilenceIntent[] = [];
  for (const [snapshot, at] of series) {
    const out = stepAudioSilenceDetector(state, snapshot, at, config);
    state = out.state;
    if (out.intent.kind !== "none") intents.push(out.intent);
  }
  return { state, intents };
}

const opens = (i: AudioSilenceIntent[]) => i.filter((x) => x.kind === "open_condition");
const closes = (i: AudioSilenceIntent[]) => i.filter((x) => x.kind === "close_condition");

/** Continuous silence samples every second from `from` to `to` inclusive. */
function silenceSeries(fromMs: number, toMs: number, level = -60) {
  const out: Array<[BrowserAudioLevelSnapshot, number]> = [];
  for (let t = fromMs; t <= toMs; t += 1000) out.push([mono(level, t), t]);
  return out;
}

function loudSeries(fromMs: number, toMs: number, level = -20) {
  const out: Array<[BrowserAudioLevelSnapshot, number]> = [];
  for (let t = fromMs; t <= toMs; t += 1000) out.push([mono(level, t), t]);
  return out;
}

describe("audio silence detector — condition detection", () => {
  it("1. normal audio produces no incident", () => {
    const { state, intents } = run(loudSeries(0, 10_000));
    expect(state.condition).toBe("normal");
    expect(intents).toHaveLength(0);
  });

  it("2. a brief dip below threshold produces no incident", () => {
    const { state, intents } = run([
      [mono(-20, 0), 0],
      [mono(-60, 1000), 1000],
      [mono(-20, 2000), 2000],
      [mono(-20, 3000), 3000],
    ]);
    expect(state.condition).toBe("normal");
    expect(intents).toHaveLength(0);
  });

  it("3. sustained measured silence produces exactly one condition", () => {
    const { state, intents } = run([[mono(-20, 0), 0], ...silenceSeries(1000, 4000)]);
    expect(state.condition).toBe("silence");
    expect(opens(intents)).toHaveLength(1);
  });

  it("4. continued silence never emits a duplicate", () => {
    const { intents } = run([[mono(-20, 0), 0], ...silenceSeries(1000, 30_000)]);
    expect(opens(intents)).toHaveLength(1);
    expect(closes(intents)).toHaveLength(0);
  });

  it("5. a brief recovery leaves the condition open", () => {
    const { state, intents } = run([
      [mono(-20, 0), 0],
      ...silenceSeries(1000, 5000),
      [mono(-10, 5500), 5500],
      [mono(-60, 5900), 5900],
      ...silenceSeries(6900, 9000),
    ]);
    expect(state.condition).toBe("silence");
    expect(closes(intents)).toHaveLength(0);
  });

  it("6. sustained recovery emits exactly one close", () => {
    const { state, intents } = run([
      [mono(-20, 0), 0],
      ...silenceSeries(1000, 5000),
      ...loudSeries(6000, 9000),
    ]);
    expect(state.condition).toBe("normal");
    expect(closes(intents)).toHaveLength(1);
    expect(opens(intents)).toHaveLength(1);
  });

  it("7. not_measured is never silence", () => {
    const series: Array<[BrowserAudioLevelSnapshot, number]> = [];
    for (let t = 0; t <= 20_000; t += 1000) series.push([notMeasuredAudio("no_audio_track"), t]);
    const { state, intents } = run(series);
    expect(state.condition).toBe("normal");
    expect(intents).toHaveLength(0);
  });

  it("8. unavailable is never silence", () => {
    const series: Array<[BrowserAudioLevelSnapshot, number]> = [];
    for (let t = 0; t <= 20_000; t += 1000) {
      series.push([unavailableAudio("media_stream_source_failed"), t]);
    }
    const { state, intents } = run(series);
    expect(state.condition).toBe("normal");
    expect(intents).toHaveLength(0);
  });

  it("9. an observation gap does not manufacture elapsed silence", () => {
    const { state, intents } = run([
      [mono(-60, 0), 0],
      // No valid observation for 5 s; the next sample restarts the window.
      [mono(-60, 5000), 5000],
      [mono(-60, 5500), 5500],
    ]);
    expect(state.condition).toBe("pending_silence");
    expect(intents).toHaveLength(0);
  });

  it("10. an observation gap does not manufacture recovery", () => {
    const opened = run([[mono(-20, 0), 0], ...silenceSeries(1000, 5000)]);
    expect(opened.state.condition).toBe("silence");
    const after = run(
      [
        [mono(-10, 6000), 6000],
        [mono(-10, 20_000), 20_000],
      ],
      cfg,
      opened.state,
    );
    expect(after.state.condition).toBe("pending_recovery");
    expect(closes(after.intents)).toHaveLength(0);
  });

  it("11. hysteresis prevents flapping between the thresholds", () => {
    const opened = run([[mono(-20, 0), 0], ...silenceSeries(1000, 5000)]);
    // -50 dBFS sits between exitDbfs (-45) and enterDbfs (-55): neither
    // recovery nor a new condition.
    const between: Array<[BrowserAudioLevelSnapshot, number]> = [];
    for (let t = 6000; t <= 20_000; t += 1000) between.push([mono(-50, t), t]);
    const after = run(between, cfg, opened.state);
    expect(after.state.condition).toBe("silence");
    expect(after.intents).toHaveLength(0);
  });

  it("12. configuration can be changed", () => {
    const fast: AudioSilenceConfig = { ...cfg, enterDbfs: -30, enterMs: 1000 };
    const { state, intents } = run(
      [
        [mono(-40, 0), 0],
        [mono(-40, 500), 500],
        [mono(-40, 1000), 1000],
      ],
      fast,
    );
    expect(state.condition).toBe("silence");
    expect(opens(intents)).toHaveLength(1);
  });

  it("stereo: one live channel prevents an incident", () => {
    const series: Array<[BrowserAudioLevelSnapshot, number]> = [];
    for (let t = 0; t <= 10_000; t += 1000) series.push([stereo(-60, -18, t), t]);
    const { state, intents } = run(series);
    expect(state.condition).toBe("normal");
    expect(intents).toHaveLength(0);
  });

  it("17. observedStartedAt is the qualifying boundary, not the detection time", () => {
    const { intents } = run([[mono(-20, 0), 0], ...silenceSeries(1000, 4000)]);
    const open = opens(intents)[0] as Extract<AudioSilenceIntent, { kind: "open_condition" }>;
    expect(open.observedStartedAt).toBe(new Date(1000).toISOString());
    expect(open.detectedAt).toBe(new Date(4000).toISOString());
  });

  it("18. observedEndedAt is the qualifying recovery boundary", () => {
    const { intents } = run([
      [mono(-20, 0), 0],
      ...silenceSeries(1000, 5000),
      ...loudSeries(6000, 9000),
    ]);
    const close = closes(intents)[0] as Extract<AudioSilenceIntent, { kind: "close_condition" }>;
    expect(close.observedEndedAt).toBe(new Date(6000).toISOString());
  });
});

describe("audio silence evidence payload", () => {
  it("16. carries browser_webrtc_pcm provenance, dBFS units and real channels", () => {
    const payload = buildAudioLevelEvidence(stereo(-59.8, -60, 1000), cfg, "fallback");
    expect(payload.observation_point).toBe("browser_webrtc_pcm");
    expect(payload.status).toBe("observed");
    expect(payload.unit).toBe("dBFS");
    expect(payload.channel_mode).toBe("stereo");
    expect(payload.levels.left.rms_dbfs).toBe(-59.8);
    expect(payload.levels.right.rms_dbfs).toBe(-60);
    expect(payload.detector.config.enterMs).toBe(cfg.enterMs);
    expect(JSON.stringify(payload)).not.toContain("rtsp_publication");
  });
});

function reporterHarness(
  overrides?: Partial<AudioSilenceReporterDeps>,
) {
  const submissions: IncidentSubmission[] = [];
  const scheduled: Array<() => void> = [];
  const deps: AudioSilenceReporterDeps = {
    submit: async (input) => {
      submissions.push(input);
      return { ok: true, outcome: "created", incidentId: "inc-1" };
    },
    recover: async () => ({ ok: true, outcome: "recovered", incidentId: "inc-1", durationMs: 4000 }),
    schedule: (fn) => {
      scheduled.push(fn);
      return scheduled.length;
    },
    ...overrides,
  };
  const reporter = new AudioSilenceReporter(
    { sessionId: "sess-1", runtimeRouteId: "route-a", slot: 1, sourceName: "Camera 3" },
    deps,
  );
  return { reporter, submissions, scheduled };
}

const measurement = mono(-60, 4000);

describe("audio silence reporter — observation vs persistence", () => {
  it("submits once through the trusted path with browser provenance", async () => {
    const h = reporterHarness();
    h.reporter.observedOpen({
      observedStartedAt: new Date(1000).toISOString(),
      detectedAt: new Date(4000).toISOString(),
      measurement,
    });
    await vi.waitFor(() => expect(h.reporter.snapshot().openState).toBe("persisted"));
    expect(h.submissions).toHaveLength(1);
    const s = h.submissions[0];
    expect(s.incidentType).toBe("audio_silence");
    expect(s.observationPoint).toBe("browser_webrtc_pcm");
    expect(s.observedStartedAt).toBe(new Date(1000).toISOString());
    expect(s.evidence?.phase).toBe("event");
  });

  it("a failed submit does not fabricate success and retries are bounded", async () => {
    let calls = 0;
    const h = reporterHarness({
      submit: async () => {
        calls += 1;
        return { ok: false, error: "network_error" };
      },
    });
    h.reporter.observedOpen({
      observedStartedAt: new Date(1000).toISOString(),
      detectedAt: new Date(4000).toISOString(),
      measurement,
    });
    await vi.waitFor(() => expect(h.reporter.snapshot().openState).toBe("unpersisted"));
    expect(h.reporter.snapshot().incidentId).toBeNull();
    // Retries only run when the scheduled timer fires — never per frame.
    for (let i = 0; i < 5; i += 1) {
      const next = h.scheduled.shift();
      if (next) next();
      await Promise.resolve();
      await Promise.resolve();
    }
    await vi.waitFor(() => expect(h.reporter.snapshot().openState).toBe("failed"));
    expect(calls).toBeLessThanOrEqual(3);
  });

  it("retry re-sends the same logical identity so the server can deduplicate", async () => {
    let first = true;
    const h = reporterHarness({
      submit: async (input) => {
        if (first) {
          first = false;
          return { ok: false, error: "network_error" };
        }
        return { ok: true, outcome: "corroborated", incidentId: "inc-1" };
      },
    });
    h.reporter.observedOpen({
      observedStartedAt: new Date(1000).toISOString(),
      detectedAt: new Date(4000).toISOString(),
      measurement,
    });
    await vi.waitFor(() => expect(h.scheduled.length).toBe(1));
    h.scheduled[0]();
    await vi.waitFor(() => expect(h.reporter.snapshot().openState).toBe("persisted"));
    expect(h.submissions.every((s) => s.observedStartedAt === new Date(1000).toISOString())).toBe(
      true,
    );
  });

  it("15. multiple observers rely on server deduplication", async () => {
    const created: string[] = [];
    const deps: Partial<AudioSilenceReporterDeps> = {
      submit: async () => {
        // The server routine corroborates the second observer's submission.
        const outcome = created.length === 0 ? "created" : "corroborated";
        created.push(outcome);
        return { ok: true, outcome, incidentId: "inc-1" };
      },
    };
    const a = reporterHarness(deps);
    const b = reporterHarness(deps);
    const open = {
      observedStartedAt: new Date(1000).toISOString(),
      detectedAt: new Date(4000).toISOString(),
      measurement,
    };
    a.reporter.observedOpen(open);
    b.reporter.observedOpen(open);
    await vi.waitFor(() => {
      expect(a.reporter.snapshot().incidentId).toBe("inc-1");
      expect(b.reporter.snapshot().incidentId).toBe("inc-1");
    });
    expect(created).toEqual(["created", "corroborated"]);
  });

  it("recovers once, with the post evidence phase", async () => {
    const recoveries: Array<{ incidentId: string; observedEndedAt: string; phase?: string }> = [];
    const h = reporterHarness({
      recover: async (args) => {
        recoveries.push({
          incidentId: args.incidentId,
          observedEndedAt: args.observedEndedAt,
          phase: args.evidence?.phase,
        });
        return { ok: true, outcome: "recovered", incidentId: args.incidentId, durationMs: 5000 };
      },
    });
    h.reporter.observedOpen({
      observedStartedAt: new Date(1000).toISOString(),
      detectedAt: new Date(4000).toISOString(),
      measurement,
    });
    await vi.waitFor(() => expect(h.reporter.snapshot().openState).toBe("persisted"));
    h.reporter.observedClose({ observedEndedAt: new Date(6000).toISOString(), measurement });
    h.reporter.observedClose({ observedEndedAt: new Date(7000).toISOString(), measurement });
    await vi.waitFor(() => expect(h.reporter.snapshot().closeState).toBe("persisted"));
    expect(recoveries).toEqual([
      { incidentId: "inc-1", observedEndedAt: new Date(6000).toISOString(), phase: "post" },
    ]);
  });

  it("observed recovery without a persisted incident never claims recovery", async () => {
    const h = reporterHarness({
      submit: async () => ({ ok: false, error: "not_authorized" }),
      recover: async () => {
        throw new Error("recover must not be called");
      },
    });
    h.reporter.observedOpen({
      observedStartedAt: new Date(1000).toISOString(),
      detectedAt: new Date(4000).toISOString(),
      measurement,
    });
    await vi.waitFor(() => expect(h.reporter.snapshot().openState).toBe("failed"));
    h.reporter.observedClose({ observedEndedAt: new Date(6000).toISOString(), measurement });
    await Promise.resolve();
    expect(h.reporter.snapshot().closeState).toBe("unpersisted");
    expect(h.reporter.snapshot().recoverCalls).toBe(0);
  });

  it("13/14. route state is per-route: route B cannot recover route A's incident", async () => {
    const routeA = reporterHarness();
    routeA.reporter.observedOpen({
      observedStartedAt: new Date(1000).toISOString(),
      detectedAt: new Date(4000).toISOString(),
      measurement,
    });
    await vi.waitFor(() => expect(routeA.reporter.snapshot().incidentId).toBe("inc-1"));
    routeA.reporter.dispose();

    // A replacement route starts from a fresh detector and a fresh reporter.
    const freshState = initialAudioSilenceState();
    expect(freshState.condition).toBe("normal");
    expect(freshState.observedStartedAt).toBeNull();

    const routeB = reporterHarness();
    routeB.reporter.observedClose({ observedEndedAt: new Date(6000).toISOString(), measurement });
    await Promise.resolve();
    expect(routeB.reporter.snapshot().recoverCalls).toBe(0);
    expect(routeB.reporter.snapshot().incidentId).toBeNull();
  });
});
