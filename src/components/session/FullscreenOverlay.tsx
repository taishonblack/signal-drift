import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SignalTile from "@/components/SignalTile";
import type { TallyState } from "@/components/SignalTile";
import type { StreamInput } from "@/lib/mock-data";
import type { LiveMetrics } from "@/hooks/use-live-metrics";

interface FullscreenOverlayProps {
  input: StreamInput;
  liveMetrics?: LiveMetrics;
  tally: TallyState;
  isAudioSource: boolean;
  onClose: () => void;
  onTallyClick: () => void;
  onSelectAudio: () => void;
  onEdit: () => void;
}

const FullscreenOverlay = ({ input, liveMetrics, tally, isAudioSource, onClose, onTallyClick, onSelectAudio, onEdit }: FullscreenOverlayProps) => {
  const bitrate = liveMetrics?.bitrate ?? input.metrics.bitrate;
  const loss = liveMetrics?.packetLoss ?? input.metrics.packetLoss;
  const rtt = liveMetrics?.rtt ?? input.metrics.rtt;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="absolute top-4 right-4 z-10">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9 bg-background/60 hover:bg-background/80 text-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 p-4">
        <SignalTile
          input={input}
          liveMetrics={liveMetrics}
          tally={tally}
          onTallyClick={onTallyClick}
          isAudioSource={isAudioSource}
          onSelectAudio={onSelectAudio}
          onEdit={onEdit}
          isFullscreen
        />
      </div>
      <div className="px-4 pb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">
          {input.label} · {bitrate.toFixed(1)} Mbps · {loss.toFixed(2)}% loss · RTT {rtt.toFixed(0)}ms
        </span>
        <span className="text-[10px] text-muted-foreground/50">Press ESC to exit</span>
      </div>
    </div>
  );
};

export default FullscreenOverlay;
