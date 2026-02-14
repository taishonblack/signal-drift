export type StreamStatus = "idle" | "connecting" | "live" | "warning" | "error";

export interface StreamInput {
  id: string;
  label: string;
  enabled: boolean;
  srtAddress: string;
  passphrase?: string;
  status: StreamStatus;
  metrics: StreamMetrics;
  videoSrc?: string;
}

export interface StreamMetrics {
  bitrate: number; // Mbps
  packetLoss: number; // %
  rtt: number; // ms
  codec: string;
  resolution: string;
  fps: number;
  audioChannels: number;
  audioSampleRate: number;
  lufs: number;
}

export interface Session {
  id: string;
  name: string;
  status: "live" | "ended" | "scheduled";
  createdAt: string;
  inputCount: number;
  pin: string;
  inputs: StreamInput[];
}

export interface QCMarker {
  id: string;
  timestamp: string;
  streamLabel: string;
  note: string;
}

const makeMetrics = (overrides?: Partial<StreamMetrics>): StreamMetrics => ({
  bitrate: 8.5,
  packetLoss: 0.02,
  rtt: 24,
  codec: "H.264 High",
  resolution: "1920×1080",
  fps: 29.97,
  audioChannels: 2,
  audioSampleRate: 48000,
  lufs: -23,
  ...overrides,
});

import mockFeed1 from "@/assets/mock-feed-1.mp4";
import mockFeed2 from "@/assets/mock-feed-2.mp4";
import mockFeed3 from "@/assets/mock-feed-3.mp4";

export const mockInputs: StreamInput[] = [
  {
    id: "line-1",
    label: "Line 1 — Camera A",
    enabled: true,
    srtAddress: "srt://ingest.example.com:9000?streamid=cam-a",
    status: "live",
    metrics: makeMetrics(),
    videoSrc: mockFeed1,
  },
  {
    id: "line-2",
    label: "Line 2 — Camera B",
    enabled: true,
    srtAddress: "srt://ingest.example.com:9001?streamid=cam-b",
    status: "live",
    metrics: makeMetrics({ bitrate: 12.1, resolution: "3840×2160", codec: "H.265 Main" }),
    videoSrc: mockFeed2,
  },
  {
    id: "line-3",
    label: "Line 3 — Program",
    enabled: true,
    srtAddress: "srt://ingest.example.com:9002?streamid=pgm",
    status: "warning",
    metrics: makeMetrics({ packetLoss: 1.8, rtt: 85, bitrate: 6.2 }),
    videoSrc: mockFeed3,
  },
  {
    id: "line-4",
    label: "Line 4 — Backup",
    enabled: false,
    srtAddress: "",
    status: "idle",
    metrics: makeMetrics({ bitrate: 0, packetLoss: 0, rtt: 0 }),
  },
];

export const mockSessions: Session[] = [
  {
    id: "sess-001",
    name: "Super Bowl LVIII — Main Feed Review",
    status: "live",
    createdAt: "2026-02-13T14:30:00Z",
    inputCount: 4,
    pin: "7284",
    inputs: mockInputs,
  },
  {
    id: "sess-002",
    name: "Champions League Semi — Remote QC",
    status: "live",
    createdAt: "2026-02-13T12:00:00Z",
    inputCount: 2,
    pin: "3910",
    inputs: mockInputs.slice(0, 2),
  },
  {
    id: "sess-003",
    name: "Concert Livestream — Audio Check",
    status: "ended",
    createdAt: "2026-02-12T20:00:00Z",
    inputCount: 3,
    pin: "5561",
    inputs: mockInputs.slice(0, 3),
  },
  {
    id: "sess-004",
    name: "News Broadcast — Pre-flight",
    status: "ended",
    createdAt: "2026-02-11T08:00:00Z",
    inputCount: 1,
    pin: "1122",
    inputs: mockInputs.slice(0, 1),
  },
];

export const mockMarkers: QCMarker[] = [
  { id: "m1", timestamp: "14:32:05", streamLabel: "Line 1 — Camera A", note: "Audio dropout 0.3s" },
  { id: "m2", timestamp: "14:35:22", streamLabel: "Line 3 — Program", note: "Packet loss spike — 1.8%" },
  { id: "m3", timestamp: "14:41:10", streamLabel: "Line 2 — Camera B", note: "Color shift detected" },
];

// Generate fake metric history for charts
export const generateMetricHistory = (points = 60) => {
  return Array.from({ length: points }, (_, i) => ({
    time: i,
    bitrate: 8 + Math.random() * 2 - 1,
    loss: Math.max(0, Math.random() * 0.5 - 0.2),
    rtt: 20 + Math.random() * 15,
  }));
};
