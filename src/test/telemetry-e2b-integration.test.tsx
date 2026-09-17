import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import InspectorPanel from "@/components/InspectorPanel";
import { useMediaTelemetry } from "@/hooks/use-media-telemetry";
import type { StreamInput } from "@/lib/mock-data";
import {
  MediaTelemetryBridgeProvider,
  type MediaProbeResult,
} from "@/lib/telemetry/provider";
import type { MediaProbePayload } from "@/lib/telemetry/media-metadata";

const ROUTE_A = "11111111-1111-4111-8111-111111111111";
const ROUTE_B = "22222222-2222-4222-8222-222222222222";

const input = (over: Partial<StreamInput> = {}): StreamInput => ({
  id: "line-1",
  label: "Source 1 — Truck A",
  enabled: true,
  srtAddress: "",
  status: "live",
  slot: 1,
  runtimeRouteId: ROUTE_A,
  streamName: "src_a241b4-opus",
  ...over,
});

const probe = (over: Partial<MediaProbePayload> = {}): MediaProbePayload => ({
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
  audio_output: { codec: "opus", sample_rate: 48000, channels: 2 },
  ...over,
});

const providerFor = (fetcher: (id: string) => Promise<MediaProbeResult>) =>
  new MediaTelemetryBridgeProvider(fetcher);

describe("Phase E.2B — one probe per ready runtime route", () => {
  it("fetches once per route and exposes the observation under that route id", async () => {
    const calls: string[] = [];
    const provider = providerFor(async (id) => {
      calls.push(id);
      return { ok: true, payload: probe() };
    });

    const { result } = renderHook(() =>
      useMediaTelemetry("sess-TEST", [input()], provider),
    );

    await waitFor(() => {
      expect(result.current.forRoute(ROUTE_A)?.video.codec.value).toBe("h264");
    });
    expect(calls).toEqual([ROUTE_A]);
    expect(result.current.forRoute(ROUTE_A)?.video.frameRate.value).toBe(29.97);
    expect(result.current.forRoute(ROUTE_A)?.observationPoint).toBe("rtsp_publication");
  });

  it("does not probe a route with no resolved playback path", async () => {
    const calls: string[] = [];
    const provider = providerFor(async (id) => {
      calls.push(id);
      return { ok: true, payload: probe() };
    });

    const { result } = renderHook(() =>
      useMediaTelemetry("sess-TEST", [input({ streamName: undefined })], provider),
    );

    await waitFor(() => expect(result.current.snapshots.length).toBe(1));
    expect(calls).toEqual([]);
    expect(result.current.forRoute(ROUTE_A)?.video.codec.status).toBe("unavailable");
  });

  it("does not probe a slot with no runtime route (no camN fallback anywhere)", async () => {
    const calls: string[] = [];
    const provider = providerFor(async (id) => {
      calls.push(id);
      return { ok: true, payload: probe() };
    });

    const { result } = renderHook(() =>
      useMediaTelemetry(
        "sess-TEST",
        [input({ runtimeRouteId: undefined, streamName: "cam1-opus" })],
        provider,
      ),
    );

    await waitFor(() => expect(result.current.snapshots.length).toBe(0));
    expect(calls).toEqual([]);
  });

  it("keeps a failed probe as unavailable without touching stream status", async () => {
    const provider = providerFor(async () => ({ ok: false, code: "telemetry_unavailable" }));
    const streams = [input()];
    const { result } = renderHook(() => useMediaTelemetry("sess-TEST", streams, provider));

    await waitFor(() => expect(result.current.snapshots.length).toBe(1));
    const snap = result.current.forRoute(ROUTE_A)!;
    expect(snap.video.codec.status).toBe("unavailable");
    expect(snap.observedAt).toBeNull();
    // The stream itself is untouched: telemetry failure is not signal failure.
    expect(streams[0].status).toBe("live");
  });

  it("resolves telemetry strictly by route id, so a replaced route cannot inherit values", async () => {
    const provider = providerFor(async (id) =>
      id === ROUTE_A
        ? { ok: true, payload: probe() }
        : { ok: false, code: "telemetry_unavailable" },
    );

    const { result } = renderHook(() =>
      useMediaTelemetry("sess-TEST", [input({ runtimeRouteId: ROUTE_B })], provider),
    );

    await waitFor(() => expect(result.current.snapshots.length).toBe(1));
    expect(result.current.forRoute(ROUTE_A)).toBeNull();
    expect(result.current.forRoute(ROUTE_B)?.video.codec.status).toBe("unavailable");
  });

  it("discards a late response once the route is gone", async () => {
    vi.useFakeTimers();
    let release: ((r: MediaProbeResult) => void) | null = null;
    const provider = providerFor(
      () => new Promise<MediaProbeResult>((res) => (release = res)),
    );

    const { result, unmount } = renderHook(() =>
      useMediaTelemetry("sess-TEST", [input()], provider),
    );
    unmount();
    await act(async () => {
      release?.({ ok: true, payload: probe() });
    });
    expect(result.current.forRoute(ROUTE_A)?.video.codec.value ?? null).not.toBe("h264");
    vi.useRealTimers();
  });

  it("retries a not-yet-published RTSP output a bounded number of times, then stops", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const provider = providerFor(async () => {
      attempts += 1;
      return { ok: false, code: "telemetry_unavailable" };
    });

    renderHook(() => useMediaTelemetry("sess-TEST", [input()], provider));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(attempts).toBe(3);
    vi.useRealTimers();
  });

  it("does not retry a not_found or unauthorized failure", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const provider = providerFor(async () => {
      attempts += 1;
      return { ok: false, code: "not_found" };
    });

    renderHook(() => useMediaTelemetry("sess-TEST", [input()], provider));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(attempts).toBe(1);
    vi.useRealTimers();
  });
});

describe("Phase E.2B — Inspector shows the observation truthfully", () => {
  const renderPanel = (telemetry: Parameters<typeof InspectorPanel>[0]["telemetry"]) =>
    render(
      <InspectorPanel
        input={input()}
        inputs={[input()]}
        selectedId="line-1"
        onSelect={() => {}}
        telemetry={telemetry}
      />,
    );

  it("renders genuine video values plus MAKO's Opus output, and no source audio", async () => {
    const provider = providerFor(async () => ({ ok: true, payload: probe() }));
    const { result } = renderHook(() => useMediaTelemetry("sess-TEST", [input()], provider));
    await waitFor(() => expect(result.current.forRoute(ROUTE_A)?.video.codec.value).toBe("h264"));

    renderPanel(result.current.forRoute(ROUTE_A));

    expect(screen.getByText("h264 High")).toBeTruthy();
    expect(screen.getByText("1920 × 1080")).toBeTruthy();
    expect(screen.getByText("29.97 fps")).toBeTruthy();
    expect(screen.getByText("progressive")).toBeTruthy();
    expect(screen.getByText("opus")).toBeTruthy();
    // Source audio and the whole Transport section stay not measured.
    expect(screen.getAllByText("Not measured").length).toBeGreaterThan(0);
  });
});
