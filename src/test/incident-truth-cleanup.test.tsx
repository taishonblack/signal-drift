/**
 * Phase E.5-Truth: the production monitoring app must not present any
 * synthetic, seeded or fabricated signal incident.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import IncidentList from "@/components/quinn/IncidentList";
import {
  getIncidents,
  getIncidentsForSession,
  getEvents,
  getEventsForIncident,
  getAlerts,
  getUnackedAlertCount,
  getUnackedAlertCountForSession,
  exportIncidentReport,
  NO_INCIDENTS_OBSERVED,
} from "@/lib/quinn-store";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("E.5-Truth — no synthetic incidents in production", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("a production session has zero incidents", () => {
    expect(getIncidents()).toEqual([]);
    expect(getIncidentsForSession("sess-ABC123")).toEqual([]);
    expect(getEvents()).toEqual([]);
    expect(getEventsForIncident("inc-001")).toEqual([]);
  });

  it("no alerts are fabricated", () => {
    expect(getAlerts()).toEqual([]);
    expect(getUnackedAlertCount("u1")).toBe(0);
    expect(getUnackedAlertCountForSession("sess-ABC123", "u1")).toBe(0);
  });

  it("previously seeded fake incidents in localStorage are never read back", () => {
    localStorage.setItem(
      "mako_quinn_incidents",
      JSON.stringify([{ id: "inc-001", summary: "packet loss 1.8%" }]),
    );
    expect(getIncidents()).toEqual([]);
  });

  it("generates no synthetic packet loss, bitrate or freeze duration", () => {
    const src = read("src/lib/quinn-store.ts");
    for (const banned of [
      "packet_loss_spike",
      "bitrate_drop",
      "freeze_detected",
      "lossBefore",
      "lossAfter",
      "bitrateBefore",
      "freezeDurationMs",
      "framesDuplicated",
      "peakDbfs",
      "seedIncidents",
      "seedEvents",
      "seedAlerts",
      "Math.random",
    ]) {
      expect(src).not.toContain(banned);
    }
  });

  it("IncidentList renders an honest empty state", () => {
    render(<IncidentList incidents={[]} onSelect={() => undefined} />);
    expect(screen.getByText(NO_INCIDENTS_OBSERVED)).toBeInTheDocument();
  });

  it("Quinn-facing incident data is empty rather than fabricated", () => {
    expect(getIncidentsForSession("sess-XYZ")).toHaveLength(0);
    const report = JSON.parse(exportIncidentReport("inc-001")) as {
      incident: unknown;
      events: unknown[];
    };
    expect(report.incident).toBeNull();
    expect(report.events).toEqual([]);
  });

  it("session reports contain no fabricated incidents", () => {
    const src = read("src/lib/session-report-pdf.ts");
    expect(src).toContain("NO_INCIDENTS_OBSERVED");
    expect(getIncidentsForSession("sess-ABC123")).toEqual([]);
  });

  it("demo data stays confined to the explore environment", () => {
    const demo = read("src/lib/demo/demo-data.ts");
    expect(demo).toBeTruthy();
    // Nothing in production monitoring imports demo data.
    for (const file of [
      "src/pages/SessionRoom.tsx",
      "src/pages/OpsDashboard.tsx",
      "src/lib/quinn-store.ts",
      "src/lib/session-report-pdf.ts",
    ]) {
      expect(read(file)).not.toContain("@/lib/demo/demo-data");
    }
  });
});
