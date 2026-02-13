import { Maximize2, Edit3, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StreamInput } from "@/lib/mock-data";
import type { LiveMetrics } from "@/hooks/use-live-metrics";

const statusAccent: Record<string, string> = {
  live: "signal-line-live",
  warning: "signal-line-warning",
  error: "signal-line-error",
  connecting: "",
  idle: "",
};

const statusBadge: Record<string, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "bg-primary/20 text-primary" },
  warning: { label: "WARN", cls: "bg-warning/20 text-warning" },
  error: { label: "ERR", cls: "bg-destructive/20 text-destructive" },
  connecting: { label: "CONNECTING", cls: "bg-muted text-muted-foreground" },
  idle: { label: "IDLE", cls: "bg-muted text-muted-foreground" },
};

interface SignalTileProps {
  input: StreamInput;
  liveMetrics?: LiveMetrics;
  isAudioSource?: boolean;
  isFullscreen?: boolean;
  onFullscreen?: () => void;
  onEdit?: () => void;
  onSelectAudio?: () => void;
}

/** Vertical audio meter bar */
const AudioMeter = ({ peakL, peakR }: { peakL: number; peakR: number }) => {
  const barColor = (level: number) => {
    if (level > 0.85) return "bg-destructive/80";
    if (level > 0.65) return "bg-warning/70";
    return "bg-primary/60";
  };

  return (
    <div className="absolute right-2 top-2 bottom-2 flex gap-px items-end">
      {[peakL, peakR].map((peak, i) => (
        <div key={i} className="w-1 h-full bg-muted/10 rounded-full overflow-hidden flex flex-col-reverse">
          <div
            className={`w-full rounded-full transition-all duration-150 ${barColor(peak)}`}
            style={{ height: `${Math.min(peak * 100, 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
};

const SignalTile = ({ input, liveMetrics, isAudioSource, isFullscreen, onFullscreen, onEdit, onSelectAudio }: SignalTileProps) => {
  const badge = statusBadge[input.status];
  const bitrate = liveMetrics?.bitrate ?? input.metrics.bitrate;
  const loss = liveMetrics?.packetLoss ?? input.metrics.packetLoss;
  const peakL = liveMetrics?.audioPeakL ?? 0;
  const peakR = liveMetrics?.audioPeakR ?? 0;
  const isActive = input.status !== "idle";

  return (
    <div className={`mako-glass rounded-lg overflow-hidden flex flex-col h-full ${statusAccent[input.status]}`}>
      {/* Video placeholder */}
      <div className={`relative flex-1 bg-mako-deep flex items-center justify-center ${isFullscreen ? "" : "aspect-video"}`}>
        <div className="text-muted-foreground/30 text-xs uppercase tracking-widest">
          {input.status === "idle" ? "No Signal" : input.label}
        </div>

        {/* Audio meters — always visible when active */}
        {isActive && <AudioMeter peakL={peakL} peakR={peakR} />}

        {/* Overlay controls */}
        {isActive && (
          <div className="absolute inset-0 flex items-end justify-between p-2 opacity-0 hover:opacity-100 transition-opacity">
            <div className="flex gap-1">
              {!isFullscreen && (
                <Button variant="ghost" size="icon" onClick={onFullscreen} className="h-7 w-7 bg-background/60 hover:bg-background/80 text-foreground">
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7 bg-background/60 hover:bg-background/80 text-foreground">
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSelectAudio}
                className={`h-7 w-7 bg-background/60 hover:bg-background/80 ${isAudioSource ? "text-primary" : "text-foreground"}`}
              >
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="text-[10px] text-foreground/70 bg-background/60 px-1.5 py-0.5 rounded font-mono">
              {bitrate.toFixed(1)} Mbps · {loss.toFixed(2)}% loss
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {!isFullscreen && (
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-muted-foreground truncate">{input.label}</span>
            {isActive && (
              <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">
                {bitrate.toFixed(1)}M
              </span>
            )}
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
      )}
    </div>
  );
};

export default SignalTile;
