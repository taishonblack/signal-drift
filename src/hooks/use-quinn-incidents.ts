// Unified Quinn incident derivation.
//
// Single canonical pipeline: Quinn detections write Timeline entries via
// useSessionTimeline. This hook aggregates those Quinn-authored entries
// (severity warning/critical) into deduplicated operational incidents used
// by the Ops dashboard and Quinn Ops side panel.
//
// Info-severity Quinn entries stay in Timeline only (per spec §3, §14).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TimelineEntry } from "@/lib/timeline-types";

export type QuinnIncidentSeverity = "warn" | "critical";
export type QuinnIncidentStatus = "open" | "ack" | "resolved";

export interface QuinnIncident {
  /** Stable fingerprint id: `${sessionId}::${sourceId}::${eventType}`. */
  id: string;
  sessionId: string;
  sessionName: string;
  sourceId: string | null;
  sourceName: string;
  eventType: string;
  severity: QuinnIncidentSeverity;
  status: QuinnIncidentStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  latestMessage: string;
  latestEntryId: string;
  confidence: number | null;
  ackedBy: string | null;
  ackedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  entryIds: string[];
}

interface StatusOverlay {
  status: "ack" | "resolved";
  actor: string;
  at: string;
}

const OVERLAY_KEY = (sessionId: string) => `mako_quinn_incident_overlay_${sessionId}`;

function readOverlay(sessionId: string): Record<string, StatusOverlay> {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY(sessionId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeOverlay(sessionId: string, map: Record<string, StatusOverlay>) {
  localStorage.setItem(OVERLAY_KEY(sessionId), JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("mako:quinn-incidents-changed", { detail: { sessionId } }));
}

function fingerprint(sessionId: string, sourceId: string | null, eventType: string): string {
  return `${sessionId}::${sourceId ?? "no-source"}::${eventType}`;
}

function getEventType(entry: TimelineEntry): string {
  const meta = entry.metadata as Record<string, unknown> | undefined;
  const et = meta && typeof meta.eventType === "string" ? meta.eventType : null;
  return et ?? entry.entryType ?? "generic";
}

interface Options {
  sessionId: string | undefined;
  sessionName: string;
  entries: TimelineEntry[];
  /** Optional actor name for ack/resolve stamps. */
  actorName?: string;
  /** Optional callback to post a system timeline entry (e.g., useSessionTimeline.addEntry). */
  postSystemEntry?: (message: string) => void;
}

export interface UseQuinnIncidentsResult {
  incidents: QuinnIncident[];
  openIncidents: QuinnIncident[];
  criticalOpenIncidents: QuinnIncident[];
  openCountsBySource: Record<string, number>;
  acknowledge: (incidentId: string) => void;
  resolve: (incidentId: string, note?: string) => void;
  reopen: (incidentId: string) => void;
}

export function useQuinnIncidents({
  sessionId,
  sessionName,
  entries,
  actorName = "Operator",
  postSystemEntry,
}: Options): UseQuinnIncidentsResult {
  const [overlay, setOverlay] = useState<Record<string, StatusOverlay>>(() =>
    sessionId ? readOverlay(sessionId) : {},
  );

  useEffect(() => {
    if (!sessionId) return;
    setOverlay(readOverlay(sessionId));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { sessionId?: string } | undefined;
      if (!detail || detail.sessionId === sessionId) setOverlay(readOverlay(sessionId));
    };
    window.addEventListener("mako:quinn-incidents-changed", onChange as EventListener);
    return () => window.removeEventListener("mako:quinn-incidents-changed", onChange as EventListener);
  }, [sessionId]);

  const incidents = useMemo<QuinnIncident[]>(() => {
    if (!sessionId) return [];
    const quinnOps = entries.filter(
      (e) =>
        e.sessionId === sessionId &&
        e.authorType === "quinn" &&
        (e.severity === "warning" || e.severity === "critical"),
    );

    const groups = new Map<string, TimelineEntry[]>();
    for (const e of quinnOps) {
      const key = fingerprint(sessionId, e.sourceId, getEventType(e));
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }

    const result: QuinnIncident[] = [];
    for (const [key, group] of groups) {
      const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const first = sorted[0];
      const latest = sorted[sorted.length - 1];
      const eventType = getEventType(latest);
      const overlayEntry = overlay[key];
      // Timeline-driven resolution: if the latest entry is resolved, so is the incident.
      const timelineResolved = latest.status === "resolved";
      const status: QuinnIncidentStatus = timelineResolved
        ? "resolved"
        : overlayEntry?.status === "resolved"
          ? "resolved"
          : overlayEntry?.status === "ack"
            ? "ack"
            : "open";
      const severity: QuinnIncidentSeverity =
        sorted.some((e) => e.severity === "critical") ? "critical" : "warn";
      result.push({
        id: key,
        sessionId,
        sessionName,
        sourceId: latest.sourceId,
        sourceName: latest.sourceName ?? "Unknown source",
        eventType,
        severity,
        status,
        firstSeenAt: first.createdAt,
        lastSeenAt: latest.createdAt,
        occurrenceCount: sorted.length,
        latestMessage: latest.message,
        latestEntryId: latest.id,
        confidence: latest.quinnConfidence,
        ackedBy: overlayEntry?.status === "ack" ? overlayEntry.actor : null,
        ackedAt: overlayEntry?.status === "ack" ? overlayEntry.at : null,
        resolvedBy: status === "resolved" ? overlayEntry?.actor ?? "system" : null,
        resolvedAt: status === "resolved" ? overlayEntry?.at ?? latest.resolvedAt ?? latest.createdAt : null,
        entryIds: sorted.map((e) => e.id),
      });
    }
    // Newest first by lastSeen
    result.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    return result;
  }, [entries, sessionId, sessionName, overlay]);

  const openIncidents = useMemo(
    () => incidents.filter((i) => i.status === "open" || i.status === "ack"),
    [incidents],
  );
  const criticalOpenIncidents = useMemo(
    () => openIncidents.filter((i) => i.severity === "critical"),
    [openIncidents],
  );

  const openCountsBySource = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inc of openIncidents) {
      if (inc.sourceId) map[inc.sourceId] = (map[inc.sourceId] ?? 0) + 1;
      if (inc.sourceName) map[inc.sourceName] = (map[inc.sourceName] ?? 0) + 1;
    }
    return map;
  }, [openIncidents]);

  const persist = useCallback(
    (id: string, patch: StatusOverlay | null) => {
      if (!sessionId) return;
      const next = { ...readOverlay(sessionId) };
      if (patch === null) delete next[id];
      else next[id] = patch;
      writeOverlay(sessionId, next);
      setOverlay(next);
    },
    [sessionId],
  );

  const acknowledge = useCallback(
    (id: string) => {
      const inc = incidents.find((i) => i.id === id);
      if (!inc || inc.status === "resolved") return;
      persist(id, { status: "ack", actor: actorName, at: new Date().toISOString() });
      postSystemEntry?.(`Incident acknowledged by ${actorName} — ${inc.sourceName} · ${inc.eventType}`);
    },
    [incidents, actorName, persist, postSystemEntry],
  );

  const resolve = useCallback(
    (id: string, note?: string) => {
      const inc = incidents.find((i) => i.id === id);
      if (!inc) return;
      persist(id, { status: "resolved", actor: actorName, at: new Date().toISOString() });
      const suffix = note ? ` — ${note}` : "";
      postSystemEntry?.(`Incident resolved by ${actorName} — ${inc.sourceName} · ${inc.eventType}${suffix}`);
    },
    [incidents, actorName, persist, postSystemEntry],
  );

  const reopen = useCallback((id: string) => persist(id, null), [persist]);

  return { incidents, openIncidents, criticalOpenIncidents, openCountsBySource, acknowledge, resolve, reopen };
}
