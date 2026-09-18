// Phase E.5B — headless monitor. Renders nothing and changes no UI; it exists
// only so the deterministic audio-silence detector runs for one runtime route
// while the Session Room is open. Existing audio meters are untouched.

import { useAudioSilenceDetection } from "@/hooks/use-audio-silence-detection";

interface AudioSilenceMonitorProps {
  sessionId: string;
  runtimeRouteId: string | null | undefined;
  slot: number | null | undefined;
  sourceName: string;
  streamName: string | null | undefined;
}

const AudioSilenceMonitor = ({
  sessionId,
  runtimeRouteId,
  slot,
  sourceName,
  streamName,
}: AudioSilenceMonitorProps) => {
  useAudioSilenceDetection({ sessionId, runtimeRouteId, slot, sourceName, streamName });
  return null;
};

export default AudioSilenceMonitor;
