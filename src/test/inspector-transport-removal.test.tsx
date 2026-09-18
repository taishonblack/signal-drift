/**
 * Phase E.5B.1 — Signal Inspector deferred-telemetry cleanup.
 *
 * The visible TRANSPORT section (Bitrate, Packet Loss, RTT and its
 * "Not measured" caption) is removed from the Signal Inspector until E.4
 * delivers genuinely measured SRT transport telemetry. Nothing is replaced
 * with placeholders and no transport claims are introduced.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InspectorPanel from "@/components/InspectorPanel";
import type { StreamInput } from "@/lib/mock-data";
import { snapshotFromMetadata } from "@/lib/telemetry/provider";
import { parseFfmpegMetadata } from "../../supabase/functions/_shared/ffmpeg-metadata";

const input: StreamInput = {
  id: "line-1",
  label: "Source 1 — Truck A",
  enabled: true,
  srtAddress: "134.209.119.136:8000",
  status: "live",
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

const renderPanel = (props: Partial<Parameters<typeof InspectorPanel>[0]> = {}) =>
  render(
    <InspectorPanel
      input={input}
      inputs={[input]}
      selectedId={input.id}
      onSelect={() => {}}
      telemetry={snapshotFromMetadata({
        identity,
        parsed: parseFfmpegMetadata(banner),
        observedAt: new Date().toISOString(),
        outputConfig: {
          audioCodec: "opus",
          audioSampleRate: 48000,
          audioChannels: 2,
          audioBitrate: 128000,
        },
      })}
      {...props}
    />,
  );

describe("E.5B.1 — Signal Inspector has no deferred Transport section", () => {
  it("renders no Transport section or transport labels", () => {
    renderPanel();
    expect(screen.queryByText(/transport/i)).toBeNull();
    expect(screen.queryByText("Bitrate")).toBeNull();
    expect(screen.queryByText("Packet Loss")).toBeNull();
    expect(screen.queryByText("RTT")).toBeNull();
    expect(screen.queryAllByText("Not measured").length).toBe(0);
  });

  it("still renders genuine Video metadata", () => {
    renderPanel();
    expect(screen.getByText("h264 High")).toBeTruthy();
    expect(screen.getByText("1920 × 1080")).toBeTruthy();
    expect(screen.getByText("59.94 fps")).toBeTruthy();
    expect(screen.getByText("progressive")).toBeTruthy();
  });

  it("still renders genuine Audio and output metadata", () => {
    renderPanel();
    expect(screen.getByText("aac (LC)")).toBeTruthy();
    expect(screen.getByText("48 kHz")).toBeTruthy();
    expect(screen.getByText("opus")).toBeTruthy();
    expect(screen.getByText("128 kb/s (configured)")).toBeTruthy();
  });

  it("still renders the Browser Audio Level section", () => {
    renderPanel();
    expect(screen.getByText("Browser Audio Level")).toBeTruthy();
    expect(screen.getByText("— Not measured")).toBeTruthy();
  });

  it("still renders the History section", () => {
    renderPanel();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("No telemetry history available.")).toBeTruthy();
  });

  it("still renders a diagnostic card when a playback condition exists", () => {
    renderPanel({ playbackState: "no_video" });
    expect(screen.getByText("Connection issue")).toBeTruthy();
    expect(
      screen.getByText("No media publication has been detected for this route."),
    ).toBeTruthy();
  });

  it("introduces no transport claims MAKO cannot measure", () => {
    const { container } = renderPanel();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\b\d+(\.\d+)?\s*Mbps\b/);
    expect(text).not.toMatch(/\b\d+(\.\d+)?\s*ms\b/);
    expect(text).not.toMatch(/packet loss/i);
    expect(text).not.toMatch(/latency/i);
    expect(text).not.toMatch(/network health/i);
    expect(text).not.toMatch(/firewall/i);
  });
});
