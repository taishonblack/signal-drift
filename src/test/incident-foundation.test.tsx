/**
 * Phase E.5A — persistent incident & evidence foundation.
 *
 * Schema facts are asserted against the applied migration SQL; the client
 * write path and read hook are asserted against a mocked backend. No detector
 * exists in this phase, so nothing here produces an incident on its own.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderHook, waitFor } from "@testing-library/react";

const rpc = vi.fn();
const order = vi.fn();
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));

const {
  submitIncidentCandidate,
  recoverIncident,
  fetchSessionIncidents,
} = await import("@/lib/incidents/incidents-remote");
const { useSignalIncidents } = await import("@/hooks/use-signal-incidents");
const { INCIDENT_TYPES, rowToIncident } = await import("@/lib/incidents/contract");

const migrationsDir = path.join(process.cwd(), "supabase/migrations");
const migrationSql = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
  .join("\n");

const foundation = migrationSql.slice(
  migrationSql.indexOf("CREATE TABLE public.signal_incidents"),
);

const row = (over: Record<string, unknown> = {}) => ({
  id: "inc-1",
  session_id: "sess-ABC123",
  runtime_route_id: "11111111-1111-4111-8111-111111111111",
  slot: 1,
  source_name: "Camera 3",
  incident_type: "audio_silence",
  detector_id: "audio_silence",
  detector_version: "1",
  threshold: { enterThresholdMs: 1000 },
  observation_point: "browser_webrtc_pcm",
  state: "open",
  workflow_status: "new",
  observed_started_at: "2026-09-18T00:00:00.000Z",
  observed_ended_at: null,
  detected_at: "2026-09-18T00:00:01.000Z",
  server_received_at: "2026-09-18T00:00:02.000Z",
  server_persisted_at: "2026-09-18T00:00:02.000Z",
  duration_ms: null,
  corroboration_count: 1,
  recovery_note: null,
  acked_by: null,
  acked_at: null,
  assigned_to: null,
  resolution_note: null,
  created_at: "2026-09-18T00:00:02.000Z",
  updated_at: "2026-09-18T00:00:02.000Z",
  ...over,
});

beforeEach(() => {
  rpc.mockReset();
  order.mockReset();
  order.mockResolvedValue({ data: [row()], error: null });
});

describe("E.5A schema", () => {
  it("accepts exactly the five allowed incident types", () => {
    const check = /signal_incidents_type_check CHECK \(\s*incident_type IN \(([^)]+)\)/.exec(
      foundation,
    );
    expect(check).toBeTruthy();
    for (const t of INCIDENT_TYPES) expect(check![1]).toContain(`'${t}'`);
  });

  it("rejects an incident type outside the allowed set", () => {
    const check = /incident_type IN \(([^)]+)\)/.exec(foundation)![1];
    expect(check).not.toContain("video_corruption");
    expect(check).not.toContain("packet_loss");
  });

  it("allows only the open and recovered states", () => {
    expect(foundation).toContain("state IN ('open','recovered')");
  });

  it("allows only the four workflow statuses", () => {
    expect(foundation).toContain(
      "workflow_status IN ('new','acknowledged','investigating','resolved')",
    );
  });

  it("has no detector severity column", () => {
    expect(foundation).not.toMatch(/\bseverity\b/);
  });

  it("keeps runtime_route_id durable — no FK, no cascade from runtime routes", () => {
    expect(foundation).toMatch(/runtime_route_id uuid,/);
    expect(foundation).not.toContain("REFERENCES public.session_runtime_routes");
  });

  it("separates observation timestamps from server persistence timestamps", () => {
    for (const c of [
      "observed_started_at timestamptz NOT NULL",
      "observed_ended_at timestamptz",
      "detected_at timestamptz NOT NULL",
      "server_received_at timestamptz NOT NULL DEFAULT now()",
      "server_persisted_at timestamptz NOT NULL DEFAULT now()",
    ]) {
      expect(foundation).toContain(c);
    }
  });

  it("stores evidence phases pre/event/post and no recording fields", () => {
    expect(foundation).toContain("phase IN ('pre','event','post')");
    expect(foundation).not.toMatch(/clip_|recording_|dvr/);
  });

  it("cascades evidence only from its parent incident", () => {
    expect(foundation).toContain(
      "REFERENCES public.signal_incidents(id) ON DELETE CASCADE",
    );
  });

  it("adds the documented indexes and no fuzzy-timestamp uniqueness key", () => {
    expect(foundation).toContain("signal_incidents_session_observed_idx");
    expect(foundation).toContain("signal_incidents_dedupe_idx");
    expect(foundation).toContain("signal_incident_evidence_incident_idx");
    expect(foundation).not.toMatch(/UNIQUE[\s\S]{0,80}observed_started_at/);
  });
});

describe("E.5A authorization", () => {
  it("restricts incident reads to session owner or session access", () => {
    expect(foundation).toContain('CREATE POLICY "Session participants can read incidents"');
    expect(foundation).toContain("public.is_session_owner(session_id, auth.uid())");
    expect(foundation).toContain("public.has_session_access(session_id, auth.uid())");
  });

  it("makes evidence reads follow the parent incident's session", () => {
    const policy = foundation.slice(
      foundation.indexOf("Evidence follows parent incident authorization"),
    );
    expect(policy).toContain("FROM public.signal_incidents i");
    expect(policy).toContain("i.session_id");
  });

  it("gives browsers read-only table access — writes go through the server", () => {
    expect(foundation).toContain("GRANT SELECT ON public.signal_incidents TO authenticated;");
    expect(foundation).not.toMatch(/GRANT[^;]*INSERT[^;]*signal_incidents TO authenticated/);
    expect(foundation).toContain("GRANT ALL ON public.signal_incidents TO service_role;");
  });

  it("both trusted routines validate session access independently", () => {
    for (const fn of ["submit_signal_incident", "recover_signal_incident"]) {
      const body = foundation.slice(foundation.indexOf(`FUNCTION public.${fn}`));
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("'not_authorized'");
      expect(body).toContain("'unauthenticated'");
    }
  });
});

describe("E.5A deduplication foundation", () => {
  it("keeps the correlation window in one documented server constant", () => {
    expect(foundation).toContain("FUNCTION public.signal_incident_correlation_window");
    expect(foundation).toContain("interval '90 seconds'");
  });

  it("serializes concurrent submissions per session, route and type", () => {
    expect(foundation).toContain("pg_advisory_xact_lock");
    expect(foundation).toMatch(/_session_id \|\| ':' \|\| coalesce\(_runtime_route_id/);
  });

  it("matches on session, route and type — never on a fuzzy timestamp key", () => {
    const body = foundation.slice(foundation.indexOf("FUNCTION public.submit_signal_incident"));
    expect(body).toContain("AND incident_type = _incident_type");
    expect(body).toContain("runtime_route_id IS NOT DISTINCT FROM _runtime_route_id");
  });

  it("corroborates by incrementing the count and keeping the earliest observed start", () => {
    const body = foundation.slice(foundation.indexOf("FUNCTION public.submit_signal_incident"));
    expect(body).toContain("corroboration_count = corroboration_count + 1");
    expect(body).toContain("observed_started_at = LEAST(observed_started_at, _observed_started_at)");
    expect(body).not.toContain("detector_id = _detector_id,");
  });

  it("reports created versus corroborated to the caller", () => {
    const body = foundation.slice(foundation.indexOf("FUNCTION public.submit_signal_incident"));
    expect(body).toContain("'created'");
    expect(body).toContain("'corroborated'");
    expect(body).toContain("'outcome', v_outcome");
  });

  it("creates no timeline entry or Quinn record", () => {
    expect(foundation).not.toContain("session_timeline_entries");
    expect(foundation.toLowerCase()).not.toContain("quinn");
  });
});

describe("E.5A recovery foundation", () => {
  const body = () =>
    foundation.slice(foundation.indexOf("FUNCTION public.recover_signal_incident"));

  it("is idempotent when the incident is already recovered", () => {
    expect(body()).toContain("'already_recovered'");
  });

  it("derives duration from observed start and end", () => {
    expect(body()).toContain("EXTRACT(EPOCH FROM (_observed_ended_at - observed_started_at))");
    expect(body()).toContain("GREATEST(0,");
  });

  it("keeps the incident persisted after recovery", () => {
    expect(body()).toContain("state = 'recovered'");
    expect(body()).not.toMatch(/DELETE FROM public\.signal_incidents/);
  });
});

describe("E.5A client write path", () => {
  it("submits a candidate through the trusted routine", async () => {
    rpc.mockResolvedValue({ data: { ok: true, outcome: "created", incidentId: "inc-1" }, error: null });
    const res = await submitIncidentCandidate({
      sessionId: "sess-ABC123",
      runtimeRouteId: "11111111-1111-4111-8111-111111111111",
      slot: 1,
      sourceName: "Camera 3",
      incidentType: "audio_silence",
      detectorId: "audio_silence",
      detectorVersion: "1",
      threshold: { enterThresholdMs: 1000 },
      observationPoint: "browser_webrtc_pcm",
      observedStartedAt: "2026-09-18T00:00:00.000Z",
      detectedAt: "2026-09-18T00:00:01.000Z",
      evidence: {
        phase: "event",
        capturedAt: "2026-09-18T00:00:01.000Z",
        observationPoint: "browser_webrtc_pcm",
        payload: { rmsDbfs: -60 },
      },
    });
    expect(rpc).toHaveBeenCalledWith("submit_signal_incident", expect.objectContaining({
      _session_id: "sess-ABC123",
      _incident_type: "audio_silence",
      _observed_started_at: "2026-09-18T00:00:00.000Z",
    }));
    expect(res).toEqual({ ok: true, outcome: "created", incidentId: "inc-1" });
  });

  it("surfaces a rejection instead of inventing an incident id", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_authorized" } });
    const res = await submitIncidentCandidate({
      sessionId: "sess-OTHER",
      runtimeRouteId: null,
      slot: null,
      sourceName: "Camera 1",
      incidentType: "black_video",
      detectorId: "black_video",
      detectorVersion: "1",
      threshold: {},
      observationPoint: "browser_decoded_video",
      observedStartedAt: "2026-09-18T00:00:00.000Z",
      detectedAt: "2026-09-18T00:00:01.000Z",
    });
    expect(res).toEqual({ ok: false, error: "not_authorized" });
  });

  it("closes an incident through the trusted recovery routine", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, outcome: "recovered", incidentId: "inc-1", durationMs: 1200 },
      error: null,
    });
    const res = await recoverIncident({
      incidentId: "inc-1",
      observedEndedAt: "2026-09-18T00:00:01.200Z",
    });
    expect(rpc).toHaveBeenCalledWith("recover_signal_incident", expect.objectContaining({
      _incident_id: "inc-1",
    }));
    expect(res).toMatchObject({ ok: true, outcome: "recovered" });
  });
});

describe("E.5A read hook", () => {
  it("loads authorized incidents newest first", async () => {
    const { result } = renderHook(() => useSignalIncidents("sess-ABC123"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.incidents).toHaveLength(1);
    expect(order).toHaveBeenCalledWith("observed_started_at", { ascending: false });
  });

  it("reports an empty ledger rather than demo or mock incidents", async () => {
    order.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useSignalIncidents("sess-ABC123"));
    await waitFor(() => expect(result.current.isEmpty).toBe(true));
    expect(result.current.incidents).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("reports an error without falling back to fabricated data", async () => {
    order.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const { result } = renderHook(() => useSignalIncidents("sess-ABC123"));
    await waitFor(() => expect(result.current.error).toBe("permission denied"));
    expect(result.current.incidents).toEqual([]);
  });
});

describe("E.5A truth", () => {
  it("maps only measured fields and never synthesizes transport telemetry", () => {
    const mapped = rowToIncident(row() as never) as unknown as Record<string, unknown>;
    expect(mapped.durationMs).toBeNull();
    for (const banned of ["rtt", "packetLoss", "retransmissions", "receiveBitrate", "severity"]) {
      expect(Object.keys(mapped)).not.toContain(banned);
    }
  });

  it("does not read from quinn-store or demo data", () => {
    for (const f of [
      "src/lib/incidents/contract.ts",
      "src/lib/incidents/incidents-remote.ts",
      "src/hooks/use-signal-incidents.ts",
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      expect(src).not.toContain("quinn-store");
      expect(src).not.toContain("demo-data");
      expect(src).not.toContain("Math.random");
    }
  });

  it("implements no detector logic in this phase", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/incidents/incidents-remote.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/setInterval|requestAnimationFrame|AnalyserNode/);
  });
});
