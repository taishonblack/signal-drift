// Simulated probe worker — emits mock incidents every 30-60s
import { useEffect, useRef } from "react";
import {
  type Incident,
  type QuinnEvent,
  type QuinnAlert,
  type EventType,
  type Severity,
  getIncidents,
  getEvents,
  getAlerts,
} from "@/lib/quinn-store";

const INCIDENTS_KEY = "mako_quinn_incidents";
const EVENTS_KEY = "mako_quinn_events";
const ALERTS_KEY = "mako_quinn_alerts";

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

interface Template {
  type: EventType;
  severity: Severity;
  summaryFn: () => string;
  evidenceFn: () => Record<string, unknown>;
}

const lines = [
  { id: "line-1", label: "Line 1 — Camera A" },
  { id: "line-2", label: "Line 2 — Camera B" },
  { id: "line-3", label: "Line 3 — Program" },
];

const sessions = [
  { id: "sess-001", name: "Super Bowl LVIII — Main Feed" },
  { id: "sess-002", name: "Champions League Semi — QC" },
];

const r = (min: number, max: number) => +(min + Math.random() * (max - min)).toFixed(2);

const templates: Template[] = [
  {
    type: "packet_loss_spike",
    severity: "warn",
    summaryFn: () => {
      const v = r(0.5, 1.4);
      return `Packet loss spike detected (${v}%). Monitoring for sustained impact.`;
    },
    evidenceFn: () => ({ lossBefore: r(0.01, 0.1), lossAfter: r(0.5, 1.4), durationMs: Math.round(r(1500, 6000)) }),
  },
  {
    type: "packet_loss_spike",
    severity: "critical",
    summaryFn: () => {
      const v = r(1.5, 3.0);
      return `Sustained packet loss at ${v}%. High freeze/artifact risk.`;
    },
    evidenceFn: () => ({ lossBefore: r(0.05, 0.2), lossAfter: r(1.5, 3.0), durationMs: Math.round(r(3000, 8000)) }),
  },
  {
    type: "bitrate_drop",
    severity: "warn",
    summaryFn: () => {
      const pct = Math.round(r(25, 55));
      return `Bitrate dropped ${pct}%. Possible encoder adaptation or congestion.`;
    },
    evidenceFn: () => ({ bitrateBefore: r(8, 14), bitrateAfter: r(3, 7), dropPct: Math.round(r(25, 55)) }),
  },
  {
    type: "freeze_detected",
    severity: "critical",
    summaryFn: () => {
      const dur = r(1.5, 5);
      return `Freeze detected for ${dur}s. Duplicate frames observed.`;
    },
    evidenceFn: () => ({ freezeDurationMs: Math.round(r(1500, 5000)), framesDuplicated: Math.round(r(30, 150)) }),
  },
  {
    type: "audio_clipping",
    severity: "warn",
    summaryFn: () => `Audio clipping detected. Peak exceeded -1.0 dBFS for ${Math.round(r(200, 1200))}ms.`,
    evidenceFn: () => ({ peakDbfs: r(-0.8, 0), durationMs: Math.round(r(200, 1200)) }),
  },
  {
    type: "pts_jump",
    severity: "warn",
    summaryFn: () => `PTS discontinuity detected. Timestamp jumped ${Math.round(r(80, 500))}ms.`,
    evidenceFn: () => ({ jumpMs: Math.round(r(80, 500)), direction: Math.random() > 0.5 ? "forward" : "backward" }),
  },
  {
    type: "black_frames",
    severity: "warn",
    summaryFn: () => `Black frames detected for ${r(0.5, 3)}s. Possible signal loss.`,
    evidenceFn: () => ({ durationMs: Math.round(r(500, 3000)), avgLuma: r(0, 5) }),
  },
];

function generateIncident(): { incident: Incident; event: QuinnEvent; alert: QuinnAlert } {
  const now = new Date().toISOString();
  const id = `inc-sim-${Date.now()}`;
  const tmpl = templates[Math.floor(Math.random() * templates.length)];
  const line = lines[Math.floor(Math.random() * lines.length)];
  const sess = sessions[Math.floor(Math.random() * sessions.length)];

  const incident: Incident = {
    id,
    sessionId: sess.id,
    sessionName: sess.name,
    primaryLineId: line.id,
    primaryLineLabel: line.label,
    startedAtUtc: now,
    endedAtUtc: null,
    severity: tmpl.severity,
    status: "open",
    summary: tmpl.summaryFn(),
    createdBy: "quinn",
  };

  const event: QuinnEvent = {
    id: `ev-sim-${Date.now()}`,
    incidentId: id,
    sessionId: sess.id,
    lineId: line.id,
    tsUtc: now,
    type: tmpl.type,
    severity: tmpl.severity,
    confidence: +r(0.82, 0.99).toFixed(2),
    evidence: tmpl.evidenceFn(),
  };

  const alert: QuinnAlert = {
    id: `al-sim-${Date.now()}`,
    incidentId: id,
    targetUserId: "u1",
    deliveredAtUtc: now,
    ackAtUtc: null,
  };

  return { incident, event, alert };
}

/**
 * Hook that simulates a probe worker emitting incidents.
 * Calls `onNewIncident` whenever a new incident is generated.
 */
export function useQuinnSimulator(onNewIncident?: () => void) {
  const callbackRef = useRef(onNewIncident);
  callbackRef.current = onNewIncident;

  useEffect(() => {
    const tick = () => {
      const { incident, event, alert } = generateIncident();

      // Persist
      const incidents = getIncidents();
      incidents.unshift(incident);
      write(INCIDENTS_KEY, incidents.slice(0, 100));

      const events = getEvents();
      events.unshift(event);
      write(EVENTS_KEY, events.slice(0, 200));

      // Only create alert for warn/critical
      if (incident.severity !== "info") {
        const alerts = getAlerts();
        alerts.unshift(alert);
        write(ALERTS_KEY, alerts.slice(0, 100));
      }

      // Auto-resolve ~30% of older open incidents to keep list manageable
      const allInc = getIncidents();
      const openOld = allInc.filter(
        (i) => i.status === "open" && new Date(i.startedAtUtc).getTime() < Date.now() - 90_000
      );
      if (openOld.length > 0 && Math.random() < 0.3) {
        const toResolve = openOld[Math.floor(Math.random() * openOld.length)];
        const idx = allInc.findIndex((i) => i.id === toResolve.id);
        if (idx !== -1) {
          allInc[idx] = { ...allInc[idx], status: "resolved", endedAtUtc: new Date().toISOString() };
          write(INCIDENTS_KEY, allInc);
        }
      }

      callbackRef.current?.();
    };

    // First emission after 8-15s, then every 30-60s
    const initialDelay = 8000 + Math.random() * 7000;
    const initialTimer = setTimeout(() => {
      tick();
      // Set up recurring interval
      const interval = setInterval(tick, 30000 + Math.random() * 30000);
      // Store cleanup
      cleanupRef.current = () => clearInterval(interval);
    }, initialDelay);

    const cleanupRef = { current: () => {} };

    return () => {
      clearTimeout(initialTimer);
      cleanupRef.current();
    };
  }, []);
}
