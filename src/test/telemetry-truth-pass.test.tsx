import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import InspectorPanel from "@/components/InspectorPanel";
import SignalTile from "@/components/SignalTile";
import type { StreamInput } from "@/lib/mock-data";
import * as mockData from "@/lib/mock-data";

const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const input: StreamInput = {
  id: "line-1",
  label: "Source 1 — Phase Test",
  enabled: true,
  srtAddress: "",
  status: "connecting",
  slot: 1,
};

/**
 * Phase E.1A Truth Pass. MAKO measures no engineering telemetry yet, so the
 * runtime must contain no generator, seed or plausible default for one.
 */
describe("Truth Pass — no fabricated engineering telemetry", () => {
  it("Signal Inspector shows unavailable states, never fabricated values", () => {
    render(
      <InspectorPanel input={input} inputs={[input]} selectedId={input.id} onSelect={() => {}} />,
    );
    for (const fabricated of [
      /H\.264/,
      /1920/,
      /29\.97/,
      /8\.5/,
      /0\.02/,
      /24 ms/,
      /48kHz/,
      /LUFS/,
      /Mbps/,
    ]) {
      expect(screen.queryByText(fabricated)).toBeNull();
    }
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not measured").length).toBe(3);
    expect(screen.getByText("No telemetry history available.")).toBeTruthy();
  });

  it("Signal Inspector never renders zeros in place of a missing measurement", () => {
    const { container } = render(
      <InspectorPanel input={input} inputs={[input]} selectedId={input.id} onSelect={() => {}} />,
    );
    expect(container.textContent).not.toMatch(/\b0(\.0+)?\s*(Mbps|ms|fps|%|LUFS)/);
  });

  it("no simulated metric engine or fake alert generator exists", () => {
    for (const f of [
      "src/hooks/use-live-metrics.ts",
      "src/hooks/use-quinn-timeline-bridge.ts",
      "src/hooks/use-quinn-simulator.ts",
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), f))).toBe(false);
    }
  });

  it("shared types export no seeded metrics or history generator", () => {
    expect("generateMetricHistory" in mockData).toBe(false);
    expect("mockInputs" in mockData).toBe(false);
    expect("mockMarkers" in mockData).toBe(false);
    expect("mockSessions" in mockData).toBe(false);
  });

  it("video tiles render no animated audio meter and no metric overlay", () => {
    const tile = src("src/components/SignalTile.tsx");
    expect(tile).not.toMatch(/AudioMeter/);
    expect(tile).not.toMatch(/audioPeak/);
    expect(tile).not.toMatch(/Mbps/);
    expect(tile).not.toMatch(/loss/);
  });

  it("no production monitoring component generates random telemetry", () => {
    for (const f of [
      "src/components/SignalTile.tsx",
      "src/components/InspectorPanel.tsx",
      "src/components/session/FullscreenOverlay.tsx",
      "src/lib/stream-paths.ts",
    ]) {
      expect(src(f)).not.toMatch(/Math\.random/);
    }
  });

  it("cannot spontaneously generate a PTS-discontinuity alert", () => {
    // No telemetry input exists, so no code path may emit PTS/freeze/black-frame
    // /clipping/loss wording into the Timeline or incident store.
    const files = [
      "src/pages/SessionRoom.tsx",
      "src/hooks/use-session-timeline.ts",
      "src/components/session/TimelinePanel.tsx",
    ];
    for (const f of files) {
      const body = src(f);
      expect(body).not.toMatch(/PTS discontinuity/i);
      expect(body).not.toMatch(/timestamp jumped/i);
      expect(body).not.toMatch(/Packet loss spike/i);
      expect(body).not.toMatch(/Freeze detected/i);
      expect(body).not.toMatch(/Black frames/i);
      expect(body).not.toMatch(/Audio clipping/i);
    }
  });

  it("Quinn is never instructed to cite unmeasured engineering figures", () => {
    const fn = src("supabase/functions/quinn-chat/index.ts");
    expect(fn).not.toMatch(/Always cite evidence with exact numbers/);
    expect(fn).toMatch(/not currently available/i);
  });

  it("genuine pane states still render", () => {
    const { rerender } = render(<SignalTile input={{ ...input, status: "connecting" }} />);
    expect(screen.getByText("Connecting")).toBeTruthy();

    rerender(<SignalTile input={{ ...input, status: "provisioning_failed" }} />);
    expect(screen.getByText("Provisioning Failed")).toBeTruthy();
    expect(screen.getByText("NOT CONNECTED")).toBeTruthy();

    rerender(<SignalTile input={{ ...input, status: "idle" }} />);
    expect(screen.getByText("Not Configured")).toBeTruthy();
  });
});
