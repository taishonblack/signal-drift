import { useEffect, useRef, useState } from "react";
import type { DemoHealth, DemoSource } from "@/lib/demo/demo-data";
import { Volume2, VolumeX } from "lucide-react";

const HEALTH_LABEL: Record<DemoHealth, string> = {
  connecting: "Connecting",
  live: "Live",
  warning: "Warning",
  reconnecting: "Reconnecting",
  offline: "No Video Streaming",
};

const HEALTH_CLASS: Record<DemoHealth, string> = {
  connecting: "bg-muted/40 text-muted-foreground",
  live: "bg-primary/15 text-primary",
  warning: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  reconnecting: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  offline: "bg-destructive/15 text-destructive",
};

function useTimecode() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const h = String(Math.floor(t / 3600)).padStart(2, "0");
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

interface Props {
  source: DemoSource;
  health: DemoHealth;
  focused: boolean;
  audio: boolean;
  onSelect: () => void;
  onMaximize: () => void;
  compact?: boolean;
}

/**
 * Synthetic, self-contained demo feed. Deliberately generated (no third-party
 * footage, no watermarks, no external URLs) so the public demo can never break
 * or ship someone else's content.
 */
export default function DemoFeedTile({
  source,
  health,
  focused,
  audio,
  onSelect,
  onMaximize,
  compact,
}: Props) {
  const tc = useTimecode();
  const ref = useRef<HTMLButtonElement>(null);
  const live = health === "live" || health === "warning";

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      onDoubleClick={onMaximize}
      aria-label={`${source.name} — ${HEALTH_LABEL[health]}${focused ? ", focused" : ""}`}
      aria-pressed={focused}
      className={`group relative w-full h-full min-w-0 overflow-hidden rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        focused ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary))]" : "border-border/20 hover:border-border/40"
      }`}
    >
      {/* synthetic picture */}
      <div
        className="absolute inset-0"
        style={{
          background: live
            ? `radial-gradient(circle at 30% 30%, hsl(${source.hue} 70% 24%), hsl(${source.hue} 60% 8%) 60%, hsl(210 50% 4%))`
            : "linear-gradient(180deg, hsl(210 40% 7%), hsl(210 50% 4%))",
        }}
      />
      {live && (
        <>
          <div className="demo-feed-sweep absolute inset-0 motion-reduce:hidden" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-full blur-2xl opacity-40 demo-feed-pulse motion-reduce:animate-none"
              style={{ width: "45%", aspectRatio: "1", background: `hsl(${source.hue} 90% 45%)` }}
            />
          </div>
        </>
      )}
      {!live && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {HEALTH_LABEL[health]}
          </span>
        </div>
      )}

      {/* overlays */}
      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] font-medium text-foreground/95 truncate">
          {source.slot}. {source.name}
        </span>
        <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${HEALTH_CLASS[health]}`}>
          {HEALTH_LABEL[health]}
        </span>
      </div>
      {!compact && (
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/90">
          <span className="font-mono">{tc}</span>
          <span className="truncate">{source.inspector.format}</span>
          <span className="ml-auto inline-flex items-center gap-1 shrink-0">
            {audio ? <Volume2 className="h-3 w-3 text-primary" /> : <VolumeX className="h-3 w-3" />}
            {audio ? "Audio" : "Muted"}
          </span>
        </div>
      )}
    </button>
  );
}
