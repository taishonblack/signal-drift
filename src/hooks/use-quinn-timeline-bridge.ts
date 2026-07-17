// Quinn Timeline Bridge (Phase 1B)
// Simulates Quinn's probe worker for a single session and writes structured
// warning/critical/information entries directly into the shared Timeline,
// with confidence and source association.

import { useEffect, useRef } from "react";
import type { StreamInput } from "@/lib/mock-data";
import type { AddQuinnEntryInput } from "@/hooks/use-session-timeline";

type Severity = "information" | "warning" | "critical";

interface Template {
  type: string;
  severity: Severity;
  summary: (line: string) => string;
  evidence: () => Record<string, unknown>;
  confidence: () => number;
}

const r = (min: number, max: number) => +(min + Math.random() * (max - min)).toFixed(2);
const conf = (min: number, max: number) => +r(min, max).toFixed(2);

const TEMPLATES: Template[] = [
  {
    type: "packet_loss_spike",
    severity: "warning",
    summary: (l) => `Packet loss spike on ${l} — ${r(0.5, 1.4)}% sustained ${Math.round(r(1.5, 6))}s.`,
    evidence: () => ({ lossBefore: r(0.01, 0.1), lossAfter: r(0.5, 1.4), durationMs: Math.round(r(1500, 6000)) }),
    confidence: () => conf(0.82, 0.95),
  },
  {
    type: "packet_loss_spike",
    severity: "critical",
    summary: (l) => `Sustained packet loss on ${l} at ${r(1.5, 3.0)}% — high freeze/artifact risk.`,
    evidence: () => ({ lossBefore: r(0.05, 0.2), lossAfter: r(1.5, 3.0), durationMs: Math.round(r(3000, 8000)) }),
    confidence: () => conf(0.9, 0.99),
  },
  {
    type: "bitrate_drop",
    severity: "warning",
    summary: (l) => `Bitrate dropped ${Math.round(r(25, 55))}% on ${l} — possible encoder adaptation or congestion.`,
    evidence: () => ({ bitrateBefore: r(8, 14), bitrateAfter: r(3, 7), dropPct: Math.round(r(25, 55)) }),
    confidence: () => conf(0.8, 0.94),
  },
  {
    type: "freeze_detected",
    severity: "critical",
    summary: (l) => `Freeze detected on ${l} for ${r(1.5, 5)}s — duplicate frames observed.`,
    evidence: () => ({ freezeDurationMs: Math.round(r(1500, 5000)), framesDuplicated: Math.round(r(30, 150)) }),
    confidence: () => conf(0.92, 0.99),
  },
  {
    type: "audio_clipping",
    severity: "warning",
    summary: (l) => `Audio clipping on ${l} — peak > -1.0 dBFS for ${Math.round(r(200, 1200))}ms.`,
    evidence: () => ({ peakDbfs: r(-0.8, 0), durationMs: Math.round(r(200, 1200)) }),
    confidence: () => conf(0.85, 0.97),
  },
  {
    type: "pts_jump",
    severity: "warning",
    summary: (l) => `PTS discontinuity on ${l} — timestamp jumped ${Math.round(r(80, 500))}ms.`,
    evidence: () => ({ jumpMs: Math.round(r(80, 500)) }),
    confidence: () => conf(0.8, 0.93),
  },
  {
    type: "black_frames",
    severity: "warning",
    summary: (l) => `Black frames on ${l} for ${r(0.5, 3)}s — possible signal loss.`,
    evidence: () => ({ durationMs: Math.round(r(500, 3000)), avgLuma: r(0, 5) }),
    confidence: () => conf(0.87, 0.98),
  },
  {
    type: "resolution_change",
    severity: "information",
    summary: (l) => `Resolution changed on ${l} — 1920×1080 → 3840×2160.`,
    evidence: () => ({ from: "1920x1080", to: "3840x2160" }),
    confidence: () => conf(0.95, 1),
  },
  {
    type: "codec_change",
    severity: "information",
    summary: (l) => `Codec switched on ${l} — H.264 → H.265.`,
    evidence: () => ({ from: "H.264", to: "H.265" }),
    confidence: () => conf(0.95, 1),
  },
];

interface Options {
  enabled: boolean;
  sessionId: string | undefined;
  inputs: StreamInput[];
  addQuinnEntry: (input: AddQuinnEntryInput) => Promise<unknown>;
  /** Min/max delay between emissions, ms. */
  minIntervalMs?: number;
  maxIntervalMs?: number;
  /** Delay before the first emission, ms. */
  initialDelayMs?: number;
}

/**
 * Emits Quinn-authored timeline entries for the current session.
 * Guards: skips entirely when disabled, when there are no configured sources,
 * or when the session id is missing.
 */
export function useQuinnTimelineBridge({
  enabled,
  sessionId,
  inputs,
  addQuinnEntry,
  minIntervalMs = 35_000,
  maxIntervalMs = 75_000,
  initialDelayMs = 12_000,
}: Options) {
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  const addRef = useRef(addQuinnEntry);
  addRef.current = addQuinnEntry;

  useEffect(() => {
    if (!enabled || !sessionId) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const emit = () => {
      const available = inputsRef.current;
      if (available.length === 0) return;
      const tmpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
      const src = available[Math.floor(Math.random() * available.length)];
      void addRef.current({
        message: tmpl.summary(src.label),
        severity: tmpl.severity,
        sourceId: src.id,
        sourceName: src.label,
        confidence: tmpl.confidence(),
        metadata: {
          eventType: tmpl.type,
          evidence: tmpl.evidence(),
          detectedAtUtc: new Date().toISOString(),
        },
        dedupeKey: `quinn-${sessionId}-${tmpl.type}-${src.id}-${Date.now()}`,
      });
    };

    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        if (cancelled) return;
        emit();
        schedule(minIntervalMs + Math.random() * (maxIntervalMs - minIntervalMs));
      }, delay);
    };

    schedule(initialDelayMs);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, sessionId, minIntervalMs, maxIntervalMs, initialDelayMs]);
}
