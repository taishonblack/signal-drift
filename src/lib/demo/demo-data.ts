// Static, sealed demo data for the public Explore Platform experience.
// Nothing here touches production tables, SRT ingest, or Quinn APIs.

export type DemoHealth = "connecting" | "live" | "warning" | "reconnecting" | "offline";

export interface DemoSource {
  id: string;
  slot: number;
  name: string;
  address: string;
  port: number;
  notes: string;
  enabled: boolean;
  health: DemoHealth;
  hue: number;
  inspector: {
    codec: string;
    resolution: string;
    frameRate: string;
    scanType: string;
    format: string;
    bitrate: number; // Mbps
    packetLoss: number; // %
    rtt: number; // ms
    audio: string;
    sampleRate: string;
    loudness: string;
  };
  testResult: {
    ok: boolean;
    headline: string;
    lines: string[];
  };
}

export const DEMO_SESSION_DEFAULTS = {
  name: "Championship Broadcast — Contribution Review",
  purpose: "QC",
  timeZone: "Eastern Time",
  durationLabel: "1 hour",
};

export const DEMO_SOURCES: DemoSource[] = [
  {
    id: "demo-src-1",
    slot: 1,
    name: "Program Feed",
    address: "demo://program-feed",
    port: 9001,
    notes: "Primary contribution output from the venue truck.",
    enabled: true,
    health: "live",
    hue: 196,
    inspector: {
      codec: "H.264 High",
      resolution: "1920×1080",
      frameRate: "29.97 fps",
      scanType: "Interlaced — Top Field First",
      format: "1080i59.94",
      bitrate: 8.4,
      packetLoss: 0.05,
      rtt: 22,
      audio: "2 channels",
      sampleRate: "48 kHz",
      loudness: "−23.2 LUFS",
    },
    testResult: {
      ok: true,
      headline: "Connection available",
      lines: ["H.264", "1920×1080", "29.97 fps", "8.4 Mbps", "Approx. latency: 820 ms"],
    },
  },
  {
    id: "demo-src-2",
    slot: 2,
    name: "Studio Camera",
    address: "demo://studio-camera",
    port: 9002,
    notes: "Commentary position, hard camera.",
    enabled: true,
    health: "live",
    hue: 168,
    inspector: {
      codec: "H.264 Main",
      resolution: "1920×1080",
      frameRate: "59.94 fps",
      scanType: "Progressive",
      format: "1080p59.94",
      bitrate: 6.1,
      packetLoss: 0.11,
      rtt: 31,
      audio: "2 channels",
      sampleRate: "48 kHz",
      loudness: "−21.8 LUFS",
    },
    testResult: {
      ok: true,
      headline: "Connection available",
      lines: ["H.264", "1920×1080", "59.94 fps", "6.1 Mbps", "Approx. latency: 640 ms"],
    },
  },
  {
    id: "demo-src-3",
    slot: 3,
    name: "Remote Interview",
    address: "demo://remote-interview",
    port: 9003,
    notes: "Remote contributor over public internet.",
    enabled: true,
    health: "warning",
    hue: 268,
    inspector: {
      codec: "H.264 Baseline",
      resolution: "1280×720",
      frameRate: "25 fps",
      scanType: "Progressive",
      format: "720p25",
      bitrate: 3.2,
      packetLoss: 1.8,
      rtt: 118,
      audio: "2 channels",
      sampleRate: "48 kHz",
      loudness: "−26.4 LUFS",
    },
    testResult: {
      ok: false,
      headline: "Signal found with elevated packet loss.",
      lines: ["H.264", "1280×720", "25 fps", "3.2 Mbps", "Packet loss: 1.8%"],
    },
  },
  {
    id: "demo-src-4",
    slot: 4,
    name: "Backup Program",
    address: "demo://backup-program",
    port: 9004,
    notes: "Redundant encoder path.",
    enabled: true,
    health: "reconnecting",
    hue: 20,
    inspector: {
      codec: "HEVC Main",
      resolution: "1920×1080",
      frameRate: "29.97 fps",
      scanType: "Interlaced — Top Field First",
      format: "1080i59.94",
      bitrate: 7.2,
      packetLoss: 0.4,
      rtt: 44,
      audio: "2 channels",
      sampleRate: "48 kHz",
      loudness: "−23.9 LUFS",
    },
    testResult: {
      ok: true,
      headline: "Connection available",
      lines: ["HEVC", "1920×1080", "29.97 fps", "7.2 Mbps", "Approx. latency: 910 ms"],
    },
  },
];

export type DemoSeverity = "note" | "information" | "warning" | "critical";
export type DemoAuthorType = "operator" | "quinn" | "system";
export type DemoStatus = "open" | "ack" | "resolved" | "informational";

export interface DemoTimelineEntry {
  id: string;
  authorName: string;
  authorType: DemoAuthorType;
  sourceId: string | null;
  sourceName: string | null;
  severity: DemoSeverity;
  message: string;
  status: DemoStatus;
  createdAt: string; // ISO
  confidence?: number;
}

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60_000).toISOString();
}

export const DEMO_TIMELINE_SEED: DemoTimelineEntry[] = [
  {
    id: "demo-tl-5",
    authorName: "Operator",
    authorType: "operator",
    sourceId: "demo-src-4",
    sourceName: "Backup Program",
    severity: "note",
    message: "Backup encoder was restarted and the signal stabilized.",
    status: "resolved",
    createdAt: minutesAgo(2),
  },
  {
    id: "demo-tl-4",
    authorName: "System",
    authorType: "system",
    sourceId: "demo-src-4",
    sourceName: "Backup Program",
    severity: "information",
    message: "Source 4 reconnected successfully.",
    status: "informational",
    createdAt: minutesAgo(4),
  },
  {
    id: "demo-tl-3",
    authorName: "Quinn AI",
    authorType: "quinn",
    sourceId: "demo-src-4",
    sourceName: "Backup Program",
    severity: "critical",
    message: "Freeze detected on Source 4 for 2.1 seconds.",
    status: "open",
    createdAt: minutesAgo(7),
    confidence: 0.93,
  },
  {
    id: "demo-tl-2",
    authorName: "Operator",
    authorType: "operator",
    sourceId: "demo-src-3",
    sourceName: "Remote Interview",
    severity: "note",
    message: "Remote contributor reported a brief audio interruption.",
    status: "open",
    createdAt: minutesAgo(9),
  },
  {
    id: "demo-tl-1",
    authorName: "Quinn AI",
    authorType: "quinn",
    sourceId: "demo-src-3",
    sourceName: "Remote Interview",
    severity: "warning",
    message: "Packet loss increased on Source 3 to 1.8%.",
    status: "open",
    createdAt: minutesAgo(12),
    confidence: 0.87,
  },
];

/** Deterministic timed Quinn events replayed once the demo session starts. */
export const DEMO_QUINN_SCRIPT: Array<{
  atMs: number;
  entry: Omit<DemoTimelineEntry, "id" | "createdAt">;
}> = [
  {
    atMs: 8000,
    entry: {
      authorName: "Quinn AI",
      authorType: "quinn",
      sourceId: "demo-src-2",
      sourceName: "Studio Camera",
      severity: "information",
      message: "Bitrate fluctuation detected on Source 2 (6.1 → 5.4 Mbps).",
      status: "informational",
      confidence: 0.78,
    },
  },
  {
    atMs: 18000,
    entry: {
      authorName: "Quinn AI",
      authorType: "quinn",
      sourceId: "demo-src-3",
      sourceName: "Remote Interview",
      severity: "warning",
      message: "Packet-loss warning on Source 3 — sustained above 1.5% for 12s.",
      status: "open",
      confidence: 0.91,
    },
  },
  {
    atMs: 30000,
    entry: {
      authorName: "Quinn AI",
      authorType: "quinn",
      sourceId: "demo-src-4",
      sourceName: "Backup Program",
      severity: "information",
      message: "Source 4 recovered — transport stable for 30s.",
      status: "informational",
      confidence: 0.95,
    },
  },
];

export const DEMO_STAGES = [
  { id: "configure", label: "Configure", path: "/explore/create" },
  { id: "monitor", label: "Monitor", path: "/explore/session" },
  { id: "respond", label: "Respond", path: "/explore/ops" },
] as const;

export type DemoStageId = (typeof DEMO_STAGES)[number]["id"];
