import { Maximize2, Edit3, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StreamInput } from "@/lib/mock-data";

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
  isAudioSource?: boolean;
  onFullscreen?: () => void;
  onEdit?: () => void;
  onSelectAudio?: () => void;
}

const SignalTile = ({ input, isAudioSource, onFullscreen, onEdit, onSelectAudio }: SignalTileProps) => {
  const badge = statusBadge[input.status];

  return (
    <div className={`mako-glass rounded-lg overflow-hidden flex flex-col ${statusAccent[input.status]}`}>
      {/* Video placeholder */}
      <div className="relative aspect-video bg-mako-deep flex items-center justify-center">
        <div className="text-muted-foreground/30 text-xs uppercase tracking-widest">
          {input.status === "idle" ? "No Signal" : input.label}
        </div>

        {/* Overlay controls */}
        {input.status !== "idle" && (
          <div className="absolute inset-0 flex items-end justify-between p-2 opacity-0 hover:opacity-100 transition-opacity">
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={onFullscreen} className="h-7 w-7 bg-background/60 hover:bg-background/80 text-foreground">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
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
            <div className="text-[10px] text-foreground/70 bg-background/60 px-1.5 py-0.5 rounded">
              {input.metrics.bitrate.toFixed(1)} Mbps · {input.metrics.packetLoss}% loss
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-muted-foreground truncate">{input.label}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
    </div>
  );
};

export default SignalTile;
