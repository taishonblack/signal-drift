import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import InspectorPanel from "@/components/InspectorPanel";
import type { StreamInput } from "@/lib/mock-data";
import { notMeasuredAudio, type BrowserAudioLevelSnapshot } from "@/lib/telemetry/browser-audio-contract";
import {
  clearReceivedStream,
  getReceivedStream,
  publishReceivedStream,
} from "@/lib/telemetry/browser-audio-registry";
import { useBrowserAudioLevels } from "@/hooks/use-browser-audio-levels";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const input: StreamInput = {
  id: "line-1",
  label: "Source 1 — Phase E3",
  enabled: true,
  srtAddress: "",
  status: "live",
  streamName: "src_e3test-opus",
} as StreamInput;

const stereoSnapshot: BrowserAudioLevelSnapshot = {
  observationPoint: "browser_webrtc_pcm",
  observedAt: new Date().toISOString(),
  status: "observed",
  channelMode: "stereo",
  left: { rms: 0.12, rmsDbfs: -18.4, peak: 0.2, peakDbfs: -14 },
  right: { rms: 0.1, rmsDbfs: -20.1, peak: 0.18, peakDbfs: -15 },
};

// ---- Minimal deterministic Web Audio fakes -------------------------------

class FakeAnalyser {
  fftSize = 2048;
  disconnected = false;
  constructor(private readonly samples: number[]) {}
  getFloatTimeDomainData(buf: Float32Array) {
    for (let i = 0; i < buf.length; i += 1) buf[i] = this.samples[i % this.samples.length];
  }
  disconnect() {
    this.disconnected = true;
  }
}

const created: FakeCtx[] = [];

class FakeCtx {
  state = "running";
  closed = false;
  sourceDisconnected = false;
  analysers: FakeAnalyser[] = [];
  constructor() {
    created.push(this);
  }
  createMediaStreamSource() {
    return {
      channelCount: 1,
      connect: () => {},
      disconnect: () => {
        this.sourceDisconnected = true;
      },
    };
  }
  createChannelSplitter() {
    return { connect: () => {}, disconnect: () => {} };
  }
  createAnalyser() {
    const a = new FakeAnalyser([0.5, -0.5]);
    this.analysers.push(a);
    return a;
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

function fakeStream(withAudio = true) {
  const track = {
    kind: "audio",
    readyState: "live",
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return {
    getAudioTracks: () => (withAudio ? [track] : []),
    getTracks: () => (withAudio ? [track] : []),
  } as unknown as MediaStream;
}

describe("E.3 browser audio metering", () => {
  beforeEach(() => {
    created.length = 0;
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
    // Deterministic frame loop: one tick per test-driven call.
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    clearReceivedStream("src_e3test-opus");
    vi.unstubAllGlobals();
  });

  it("renders Not measured when analysis is unavailable", () => {
    const { container } = render(
      <InspectorPanel
        input={input}
        inputs={[input]}
        selectedId={input.id}
        onSelect={() => {}}
        audioLevel={notMeasuredAudio("no_audio_track")}
      />,
    );
    expect(container.textContent).toMatch(/Browser Audio Level/);
    expect(container.textContent).toMatch(/— Not measured/);
    expect(container.textContent).not.toMatch(/dBFS/);
  });

  it("renders the supplied real dBFS values for stereo", () => {
    const { container } = render(
      <InspectorPanel
        input={input}
        inputs={[input]}
        selectedId={input.id}
        onSelect={() => {}}
        audioLevel={stereoSnapshot}
      />,
    );
    expect(container.textContent).toMatch(/-18\.4 dBFS/);
    expect(container.textContent).toMatch(/-20\.1 dBFS/);
    expect(container.textContent).toMatch(/pk -14\.0/);
  });

  it("shows a single mono row rather than duplicated L/R", () => {
    const mono: BrowserAudioLevelSnapshot = {
      observationPoint: "browser_webrtc_pcm",
      observedAt: new Date().toISOString(),
      status: "observed",
      channelMode: "mono",
      mono: { rms: 0.12, rmsDbfs: -18.4, peak: 0.2, peakDbfs: -14 },
    };
    const { container } = render(
      <InspectorPanel
        input={input}
        inputs={[input]}
        selectedId={input.id}
        onSelect={() => {}}
        audioLevel={mono}
      />,
    );
    const rows = container.querySelectorAll('[role="meter"]');
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute("aria-label")).toBe("M level");
  });

  it("indicates Silence only from real floor-level measurement", () => {
    const silent: BrowserAudioLevelSnapshot = {
      observationPoint: "browser_webrtc_pcm",
      observedAt: new Date().toISOString(),
      status: "observed",
      channelMode: "mono",
      mono: { rms: 0, rmsDbfs: -60, peak: 0, peakDbfs: -60 },
    };
    const { container } = render(
      <InspectorPanel
        input={input}
        inputs={[input]}
        selectedId={input.id}
        onSelect={() => {}}
        audioLevel={silent}
      />,
    );
    expect(container.textContent).toMatch(/Silence/);
  });

  it("measures from the stream LiveCamera already received, with playback muted", () => {
    publishReceivedStream("src_e3test-opus", fakeStream());
    const { result } = renderHook(() => useBrowserAudioLevels("src_e3test-opus"));
    // No <video> element is unmuted anywhere in this test: measurement is
    // completely independent of whether the operator is listening.
    expect(result.current.status).toBe("observed");
    expect(result.current.observationPoint).toBe("browser_webrtc_pcm");
    expect(result.current.channelMode).toBe("mono");
    expect(result.current.mono?.rmsDbfs).toBeCloseTo(-6.02, 1);
    // Passive graph: analysers only, nothing connected to a destination.
    expect(read("src/hooks/use-browser-audio-levels.ts")).not.toMatch(/connect\([^)]*destination/);
  });

  it("reports not measured when the received stream carries no audio track", () => {
    publishReceivedStream("src_e3test-opus", fakeStream(false));
    const { result } = renderHook(() => useBrowserAudioLevels("src_e3test-opus"));
    expect(result.current.status).toBe("not_measured");
    expect(result.current.mono).toBeUndefined();
  });

  it("closes the AudioContext on stream change (reconnect) and on unmount", () => {
    publishReceivedStream("src_e3test-opus", fakeStream());
    const { unmount } = renderHook(() => useBrowserAudioLevels("src_e3test-opus"));
    expect(created.length).toBe(1);

    // WHEP reconnect: the previous graph is torn down before the new one starts.
    act(() => {
      publishReceivedStream("src_e3test-opus", fakeStream());
    });
    expect(created[0].closed).toBe(true);
    expect(created[0].sourceDisconnected).toBe(true);
    expect(created.length).toBe(2);

    unmount();
    expect(created[1].closed).toBe(true);
    expect(created.every((c) => c.closed)).toBe(true);
  });

  it("clears the registry when LiveCamera tears the connection down", () => {
    const stream = fakeStream();
    publishReceivedStream("src_e3test-opus", stream);
    expect(getReceivedStream("src_e3test-opus")).toBe(stream);
    clearReceivedStream("src_e3test-opus", stream);
    expect(getReceivedStream("src_e3test-opus")).toBeNull();
  });

  it("LiveCamera keeps one received stream and publishes it (no second WHEP)", () => {
    const live = read("src/components/LiveCamera.tsx");
    expect(live).toMatch(/publishReceivedStream/);
    expect(live).toMatch(/clearReceivedStream/);
    expect(live).toMatch(/stream\.addTrack/);
    // Exactly one WHEP negotiation path remains.
    expect((live.match(/negotiateWhep\(/g) ?? []).length).toBe(1);
  });

  it("no synthetic audio meter remains in the monitoring surfaces", () => {
    for (const f of [
      "src/components/SignalTile.tsx",
      "src/components/session/FullscreenOverlay.tsx",
      "src/pages/SourcePopoutPage.tsx",
      "src/pages/LayoutPopoutPage.tsx",
    ]) {
      const s = read(f);
      expect(s).not.toMatch(/Math\.random/);
      expect(s).not.toMatch(/audioLevel\s*=\s*\d/);
    }
  });
});
