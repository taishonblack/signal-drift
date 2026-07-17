import { useEffect, useRef, useState } from "react";
import LiveCamera from "@/components/LiveCamera";
import { Maximize2, Edit3, Volume2, VolumeX, VideoOff, WifiOff, Loader2, PlugZap, RefreshCw, ExternalLink, Focus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StreamInput } from "@/lib/mock-data";
import type { LiveMetrics } from "@/hooks/use-live-metrics";
import TimeOverlay from "@/components/session/TimeOverlay";
import SafeAreaOverlay from "@/components/session/SafeAreaOverlay";
import type { TimeDisplayPrefs } from "@/lib/time-utils";

interface SignalTileProps {
  input: StreamInput;
  liveMetrics?: LiveMetrics;
  isFocused?: boolean;
  isAudioSource?: boolean;
  /** Global mute-all — overrides isAudioSource and mutes every pane. */
  muteAll?: boolean;
  isFullscreen?: boolean;
  onFocusClick?: () => void;
  onFullscreen?: () => void;
  onEdit?: () => void;
  onSelectAudio?: () => void;
  /** Detach this source into a separate browser window. */
  onPopOut?: () => void;
  /** True when this source is currently rendered in a popout window. */
  isPoppedOut?: boolean;
  /** Bring the popout window back into the docked pane. */
  onBringBack?: () => void;
  /** Focus the popout window. */
  onFocusPopout?: () => void;
  timePrefs?: TimeDisplayPrefs;
  tileOriginTZ?: string;
  focusedOriginTZ?: string;
  sessionStartedAt?: string;
  showSafeArea?: boolean;
}



const statusBadge: Record<string, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "bg-primary/20 text-primary" },
  warning: { label: "WARN", cls: "bg-warning/20 text-warning" },
  error: { label: "ERR", cls: "bg-destructive/20 text-destructive" },
  connecting: { label: "CONNECTING", cls: "bg-muted text-muted-foreground" },
  idle: { label: "IDLE", cls: "bg-muted text-muted-foreground" },
};

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

const SignalTile = ({
  input, liveMetrics, isFocused = false, isAudioSource, muteAll = false, isFullscreen,
  onFocusClick, onFullscreen, onEdit, onSelectAudio,
  onPopOut, isPoppedOut = false, onBringBack, onFocusPopout,
  timePrefs, tileOriginTZ = "UTC", focusedOriginTZ = "UTC", sessionStartedAt = "",
  showSafeArea = false,
}: SignalTileProps) => {
  const badge = statusBadge[input.status];
  const bitrate = liveMetrics?.bitrate ?? input.metrics.bitrate;
  const loss = liveMetrics?.packetLoss ?? input.metrics.packetLoss;
  const peakL = liveMetrics?.audioPeakL ?? 0;
  const peakR = liveMetrics?.audioPeakR ?? 0;
  const isActive = input.status !== "idle";

  // Personal audio state — this pane is the audio source for this viewer,
  // and mute-all is not overriding it.
  const wantsAudio = !!isAudioSource && !muteAll;
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Local <video> path (non-WebRTC): mirror the requested mute state and
  // probe autoplay. Browsers only allow unmuted playback after a user
  // gesture — the parent should call onSelectAudio in direct response to
  // a click for this to succeed on the first try.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !wantsAudio;
    if (!wantsAudio) {
      setAudioBlocked(false);
      return;
    }
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    }
  }, [wantsAudio]);

  const enableAudioFromOverlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    el.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
  };



  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden flex flex-col h-full min-h-0 border-2 transition-all cursor-pointer",
        isFocused ? "border-primary" : "border-transparent",
        !isFocused && "opacity-[0.92]"
      )}
      style={{
        background: "hsla(205, 55%, 8%, 0.75)",
        backdropFilter: "blur(16px)",
        boxShadow: isFocused
          ? "0 0 12px 0 hsla(195, 100%, 50%, 0.12) inset"
          : "0 0 0 1px hsla(195, 100%, 50%, 0.05) inset",
      }}
      onClick={onFocusClick}
    >
      {/* Accent strip */}
      {isFocused && <div className="h-0.5 bg-primary" />}
      {!isFocused && input.status === "live" && <div className="h-0.5 bg-primary/40" />}
      {!isFocused && input.status === "warning" && <div className="h-0.5 bg-warning" />}
      {!isFocused && input.status === "error" && <div className="h-0.5 bg-destructive" />}

      {/* Video placeholder – always 16:9 */}
      <div className={`relative flex items-center justify-center ${isFullscreen ? "flex-1" : "flex-1 min-h-0 w-full"}`} style={{ background: "black" }}>
        {isPoppedOut ? (
          <PoppedOutPlaceholder
            label={input.label}
            onFocusPopout={onFocusPopout}
            onBringBack={onBringBack}
          />
        ) : input.id === "line-1" && isActive ? (
          <LiveCamera
            streamName="cam1"
            muted={!wantsAudio}
            onAudioBlocked={() => setAudioBlocked(true)}
            onAudioPlaying={() => setAudioBlocked(false)}
          />
        ) : input.videoSrc && input.status === "live" ? (
          <video
            ref={videoRef}
            src={input.videoSrc}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <PaneStatus status={input.status} label={input.label} onRetry={onEdit} />
        )}


        {/* Focus badge */}
        {isFocused && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-primary/70 text-primary-foreground uppercase">
            Focus
          </div>
        )}

        {/* Personal audio indicator — always visible on the selected pane. */}
        {isActive && isAudioSource && (
          <div
            className={cn(
              "absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase",
              muteAll ? "bg-muted/70 text-muted-foreground" : "bg-primary/70 text-primary-foreground",
              isFocused ? "translate-y-5" : "",
            )}
            title={muteAll ? "Muted (Mute All)" : "Audio source"}
          >
            {muteAll ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            <span>Audio</span>
          </div>
        )}

        {/* Autoplay-blocked overlay — surfaced when the browser refuses unmuted playback. */}
        {isActive && wantsAudio && audioBlocked && (
          <button
            type="button"
            onClick={enableAudioFromOverlay}
            className="absolute inset-x-0 bottom-8 mx-auto w-max px-3 py-1.5 rounded bg-background/80 border border-primary/40 text-xs text-foreground hover:bg-background z-10"
          >
            <Volume2 className="inline h-3.5 w-3.5 mr-1.5" />
            Click to enable audio
          </button>
        )}


        {/* Time overlay */}
        {timePrefs && isActive && (
          <TimeOverlay
            prefs={timePrefs}
            tileOriginTZ={tileOriginTZ}
            focusedOriginTZ={focusedOriginTZ}
            sessionStartedAt={sessionStartedAt}
          />
        )}

        {/* Safe area overlay */}
        {isActive && showSafeArea && <SafeAreaOverlay />}

        {/* Audio meters */}
        {isActive && <AudioMeter peakL={peakL} peakR={peakR} />}

        {/* Overlay controls */}
        {isActive && !isPoppedOut && (
          <div className="absolute inset-0 flex items-end justify-between p-2 opacity-0 hover:opacity-100 transition-opacity pointer-events-none [&>*]:pointer-events-auto hover:pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-1">
              {!isFullscreen && (
                <Button variant="ghost" size="icon" onClick={onFullscreen} className="h-7 w-7 bg-background/60 hover:bg-background/80 text-foreground" title="Maximize pane">
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7 bg-background/60 hover:bg-background/80 text-foreground" title="Edit source">
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSelectAudio}
                className={`h-7 w-7 bg-background/60 hover:bg-background/80 ${isAudioSource ? "text-primary" : "text-foreground"}`}
                title="Select audio source"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
              {onPopOut && !isFullscreen && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); onPopOut(); }}
                  className="h-7 w-7 bg-background/60 hover:bg-background/80 text-foreground"
                  aria-label="Pop Out Source"
                  title="Pop Out Source"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              )}
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

/**
 * Explicit, labeled pane state — replaces silent black panes so operators
 * always know what MAKO is doing with each source.
 */
const PaneStatus = ({
  status,
  label,
  onRetry,
}: {
  status: string;
  label: string;
  onRetry?: () => void;
}) => {
  const map: Record<string, { title: string; hint: string; Icon: any; tone: string; showRetry: boolean }> = {
    idle: {
      title: "Not Configured",
      hint: "Add an SRT address to this source.",
      Icon: PlugZap,
      tone: "text-muted-foreground/70",
      showRetry: false,
    },
    connecting: {
      title: "Connecting",
      hint: `Contacting ${label}…`,
      Icon: Loader2,
      tone: "text-primary/80",
      showRetry: false,
    },
    reconnecting: {
      title: "Reconnecting",
      hint: "Source interrupted — retrying.",
      Icon: Loader2,
      tone: "text-[hsl(var(--warning))]",
      showRetry: true,
    },
    no_video: {
      title: "No Video Streaming",
      hint: "Source reached, but no playable video.",
      Icon: VideoOff,
      tone: "text-[hsl(var(--warning))]",
      showRetry: true,
    },
    warning: {
      title: "No Video Streaming",
      hint: "Signal reached, but nothing to display.",
      Icon: VideoOff,
      tone: "text-[hsl(var(--warning))]",
      showRetry: true,
    },
    error: {
      title: "Connection Failed",
      hint: "MAKO could not reach this source.",
      Icon: WifiOff,
      tone: "text-destructive",
      showRetry: true,
    },
  };
  const s = map[status] ?? map.idle;
  const Icon = s.Icon;
  const spinning = status === "connecting" || status === "reconnecting";
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
      <Icon className={`h-6 w-6 ${s.tone} ${spinning ? "animate-spin" : ""}`} />
      <div className={`text-[11px] uppercase tracking-widest font-semibold ${s.tone}`}>
        {s.title}
      </div>
      <div className="text-[10px] text-muted-foreground/60 max-w-[200px]">{s.hint}</div>
      {s.showRetry && onRetry && (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-1"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </Button>
      )}
    </div>
  );
};

const PoppedOutPlaceholder = ({
  label,
  onFocusPopout,
  onBringBack,
}: {
  label: string;
  onFocusPopout?: () => void;
  onBringBack?: () => void;
}) => (
  <div
    className="flex flex-col items-center justify-center gap-2 p-4 text-center"
    onClick={(e) => e.stopPropagation()}
  >
    <ExternalLink className="h-6 w-6 text-primary/80" />
    <div className="text-[11px] uppercase tracking-widest font-semibold text-primary/80">
      Source Popped Out
    </div>
    <div className="text-[10px] text-muted-foreground/70 max-w-[220px]">
      {label} is open in another window.
    </div>
    <div className="flex items-center gap-1.5 mt-1">
      {onFocusPopout && (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); onFocusPopout(); }}
          className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Focus className="h-3 w-3" /> Focus Popout
        </Button>
      )}
      {onBringBack && (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => { e.stopPropagation(); onBringBack(); }}
          className="h-6 gap-1 text-[10px]"
        >
          Bring Back
        </Button>
      )}
    </div>
  </div>
);

export default SignalTile;
