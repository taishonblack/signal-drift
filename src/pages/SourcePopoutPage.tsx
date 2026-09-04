import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Maximize2, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SignalTile from "@/components/SignalTile";
import { getSessionById, parseSrtInput } from "@/lib/session-store";
import { inputsFromRecord } from "@/lib/stream-paths";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { loadTimePrefs } from "@/lib/time-utils";

/**
 * Standalone view for a single source pane, rendered inside a detached
 * browser window. No sidebar, no main toolbar — just the video, event
 * clock, audio control, and a small action bar.
 */
const SourcePopoutPage = () => {
  const { sessionId, sourceId } = useParams();
  const record = sessionId ? getSessionById(sessionId) : undefined;
  const inputs = record ? inputsFromRecord(record, parseSrtInput) : [];
  const session = {
    id: record?.id ?? sessionId ?? "",
    name: record?.name ?? "Session",
    inputs,
  };
  const input = inputs.find((i) => i.id === sourceId) ?? inputs[0];

  const [muted, setMuted] = useState(false);
  const [showMeta, setShowMeta] = useState(true);
  const { getMetrics } = useLiveMetrics(session.inputs);
  const metrics = input ? getMetrics(input.id) : undefined;
  const timePrefs = loadTimePrefs(session.id);

  useEffect(() => {
    if (!input) return;
    document.title = `${input.label} · ${session.name} — MAKO Popout`;
  }, [input?.label, session.name]);

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {
      /* ignore */
    });
  };

  const returnToSession = () => {
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.focus();
      } catch {
        /* ignore */
      }
    }
  };

  if (!input) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background text-sm text-muted-foreground">
        Source not found for this session.
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Top strip */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20 shrink-0">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary">
            Popout
          </span>
          <span className="text-sm font-medium truncate">{input.label}</span>
          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
            {session.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {muted ? "Muted" : "Audio"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setShowMeta((v) => !v)}
          >
            {showMeta ? "Hide Metrics" : "Show Metrics"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={enterFullscreen}
            aria-label="Fullscreen"
            title="Fullscreen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={returnToSession}
          >
            Return to Session
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => window.close()}
            aria-label="Close popout"
            title="Close popout"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 min-h-0 p-2">
        <SignalTile
          input={input}
          liveMetrics={metrics}
          isFocused
          isAudioSource={!muted}
          muteAll={muted}
          timePrefs={timePrefs}
          isFullscreen
        />
      </div>

      {showMeta && (
        <div className="px-3 py-1.5 border-t border-border/20 text-[10px] font-mono text-muted-foreground shrink-0">
          {metrics?.bitrate.toFixed(1)} Mbps · {metrics?.packetLoss.toFixed(2)}% loss · RTT{" "}
          {metrics?.rtt.toFixed(0)}ms · {input.metrics.resolution} @ {input.metrics.fps} fps
        </div>
      )}
    </div>
  );
};

export default SourcePopoutPage;
