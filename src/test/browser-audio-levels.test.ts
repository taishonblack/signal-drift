import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  amplitudeToDbfs,
  applyRelease,
  dbfsToMeterFraction,
  DBFS_FLOOR,
  isEffectivelySilent,
  levelFromSamples,
  peakFromSamples,
  rmsFromSamples,
} from "@/lib/telemetry/browser-audio-levels";
import {
  hasAudioMeasurement,
  isStereo,
  notMeasuredAudio,
  unavailableAudio,
} from "@/lib/telemetry/browser-audio-contract";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("E.3 pure audio math", () => {
  it("amplitude 1.0 is 0 dBFS", () => {
    expect(amplitudeToDbfs(1)).toBe(0);
  });

  it("amplitude 0.5 is approximately -6.02 dBFS", () => {
    expect(amplitudeToDbfs(0.5)).toBeCloseTo(-6.0206, 3);
  });

  it("silence falls to the -60 dBFS floor", () => {
    expect(amplitudeToDbfs(0)).toBe(DBFS_FLOOR);
    expect(amplitudeToDbfs(0.00001)).toBe(DBFS_FLOOR);
    expect(isEffectivelySilent(amplitudeToDbfs(0))).toBe(true);
  });

  it("never reports positive dBFS, even for over-scale samples", () => {
    expect(amplitudeToDbfs(4)).toBe(0);
    const level = levelFromSamples(new Float32Array([2, -3, 2.5]));
    expect(level.rmsDbfs).toBeLessThanOrEqual(0);
    expect(level.peakDbfs).toBe(0);
  });

  it("computes RMS from known PCM samples", () => {
    // RMS of [0.5, -0.5, 0.5, -0.5] is exactly 0.5
    expect(rmsFromSamples(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 6);
    // RMS of [1, 0] is sqrt(0.5)
    expect(rmsFromSamples(new Float32Array([1, 0]))).toBeCloseTo(Math.SQRT1_2, 6);
    expect(rmsFromSamples(new Float32Array([]))).toBe(0);
  });

  it("computes peak from known PCM samples", () => {
    expect(peakFromSamples(new Float32Array([0.1, -0.8, 0.3]))).toBeCloseTo(0.8, 6);
    expect(peakFromSamples(new Float32Array([0, 0, 0]))).toBe(0);
  });

  it("mono is never falsely presented as stereo", () => {
    const mono = {
      observationPoint: "browser_webrtc_pcm" as const,
      observedAt: new Date().toISOString(),
      status: "observed" as const,
      channelMode: "mono" as const,
      mono: { rms: 0.5, rmsDbfs: -6, peak: 0.6, peakDbfs: -4.4 },
    };
    expect(isStereo(mono)).toBe(false);
    expect(hasAudioMeasurement(mono)).toBe(true);
    // A "stereo" claim without two independent channels is rejected.
    expect(isStereo({ ...mono, channelMode: "stereo" })).toBe(false);
  });

  it("treats missing measurement as not measured, never as zero", () => {
    expect(hasAudioMeasurement(notMeasuredAudio("no_audio_track"))).toBe(false);
    expect(hasAudioMeasurement(unavailableAudio())).toBe(false);
    expect(notMeasuredAudio().mono).toBeUndefined();
  });

  it("release ballistics rise instantly and fall gradually", () => {
    expect(applyRelease(-40, -10, 16)).toBe(-10); // fast attack
    const released = applyRelease(-10, -50, 16, 300);
    expect(released).toBeGreaterThan(-50);
    expect(released).toBeLessThan(-10);
    expect(applyRelease(null, -22, 16)).toBe(-22);
  });

  it("maps the dBFS scale onto a 0..1 meter fraction", () => {
    expect(dbfsToMeterFraction(0)).toBe(1);
    expect(dbfsToMeterFraction(-60)).toBe(0);
    expect(dbfsToMeterFraction(-30)).toBeCloseTo(0.5, 6);
    expect(dbfsToMeterFraction(-999)).toBe(0);
  });

  it("contains no randomness or synthetic level generation", () => {
    for (const f of [
      "src/lib/telemetry/browser-audio-levels.ts",
      "src/lib/telemetry/browser-audio-contract.ts",
      "src/lib/telemetry/browser-audio-registry.ts",
      "src/hooks/use-browser-audio-levels.ts",
      "src/components/InspectorPanel.tsx",
    ]) {
      const s = read(f);
      expect(s).not.toMatch(/Math\.random/);
      // LUFS may only appear in prose that rules it out, never as a label.
      expect(s).not.toMatch(/"[^"]*LUFS[^"]*"|'[^']*LUFS[^']*'|>\s*LUFS/);
    }
  });
});
