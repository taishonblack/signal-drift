import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InspectorPanel from "@/components/InspectorPanel";
import type { StreamInput } from "@/lib/mock-data";
import { emptySnapshot } from "@/lib/telemetry/contract";
import { snapshotFromMetadata } from "@/lib/telemetry/provider";
import { parseFfmpegMetadata } from "../../supabase/functions/_shared/ffmpeg-metadata";

const input: StreamInput = {
  id: "line-1",
  label: "Source 1 — Truck A",
  enabled: true,
  srtAddress: "",
  status: "connecting",
  slot: 1,
  runtimeRouteId: "route-1",
};

const identity = {
  runtimeRouteId: "route-1",
  sessionId: "sess-TEST",
  slot: 1,
  infrastructureSourceId: "src_a241b4",
  playbackPath: "src_a241b4-opus",
};

const banner =
  "Stream #0:0: Video: h264 (High), yuv420p(tv, bt709, progressive), 1920x1080, 59.94 fps\n" +
  "Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, 192 kb/s";

const renderPanel = (telemetry: Parameters<typeof InspectorPanel>[0]["telemetry"]) =>
  render(
    <InspectorPanel
      input={input}
      inputs={[input]}
      selectedId={input.id}
      onSelect={() => {}}
      telemetry={telemetry}
    />,
  );

describe("Phase E.2 — Signal Inspector reads the telemetry contract", () => {
  it("shows genuine observed media values", () => {
    renderPanel(
      snapshotFromMetadata({
        identity,
        parsed: parseFfmpegMetadata(banner),
        observedAt: new Date().toISOString(),
        outputConfig: {
          audioCodec: "opus",
          audioSampleRate: 48000,
          audioChannels: 2,
          audioBitrate: 128000,
        },
      }),
    );
    expect(screen.getByText("h264 High")).toBeTruthy();
    expect(screen.getByText("1920 × 1080")).toBeTruthy();
    expect(screen.getByText("59.94 fps")).toBeTruthy();
    expect(screen.getByText("aac (LC)")).toBeTruthy();
    expect(screen.getByText("opus")).toBeTruthy();
    expect(screen.getByText("128 kb/s (configured)")).toBeTruthy();
  });

  it("renders no Transport section even when media is observed", () => {
    renderPanel(
      snapshotFromMetadata({
        identity,
        parsed: parseFfmpegMetadata(banner),
        observedAt: new Date().toISOString(),
        configuredReceiverLatencyUs: 120000,
      }),
    );
    expect(screen.queryByText("Transport")).toBeNull();
    expect(screen.queryByText("Bitrate")).toBeNull();
    expect(screen.queryByText("Packet Loss")).toBeNull();
    expect(screen.queryByText("RTT")).toBeNull();
    expect(screen.queryAllByText("Not measured").length).toBe(0);
    expect(screen.queryByText(/RTT.*ms/)).toBeNull();
    expect(screen.queryByText(/120/)).toBeNull();
    expect(screen.queryByText(/Mbps/)).toBeNull();
  });

  it("shows every field as unavailable when nothing is observed", () => {
    const { container } = renderPanel(emptySnapshot(identity));
    expect(screen.getAllByText("Not measured").length).toBe(2);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/\b0(\.0+)?\s*(Mbps|ms|fps|%|kHz)/);
  });

  it("shows no telemetry at all when no snapshot exists for the route", () => {
    renderPanel(null);
    expect(screen.getAllByText("Not measured").length).toBe(2);
    expect(screen.getByText("No telemetry history available.")).toBeTruthy();
  });

  it("never renders LUFS, audio meters or invented history", () => {
    const { container } = renderPanel(
      snapshotFromMetadata({
        identity,
        parsed: parseFfmpegMetadata(banner),
        observedAt: new Date().toISOString(),
      }),
    );
    expect(container.textContent).not.toMatch(/LUFS/);
    expect(container.textContent).not.toMatch(/dBFS/);
    expect(screen.getByText("No telemetry history available.")).toBeTruthy();
  });
});
