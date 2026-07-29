import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DemoShell from "@/components/demo/DemoShell";
import DemoFeedTile from "@/components/demo/DemoFeedTile";
import { useDemo, trackDemoEvent } from "@/contexts/DemoModeProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Grid2x2, Square, Rows2, Columns2, Volume2, VolumeX, ArrowRight, Pause, Play } from "lucide-react";
import type { DemoHealth, DemoSeverity } from "@/lib/demo/demo-data";

type LayoutId = "1" | "2" | "3" | "4";

const LAYOUTS: Array<{ id: LayoutId; label: string; icon: typeof Square; min: number }> = [
  { id: "1", label: "1-up", icon: Square, min: 1 },
  { id: "2", label: "2-up", icon: Columns2, min: 2 },
  { id: "3", label: "3-up", icon: Rows2, min: 3 },
  { id: "4", label: "4-up", icon: Grid2x2, min: 4 },
];

const SEVERITY_CLASS: Record<DemoSeverity, string> = {
  note: "bg-muted/40 text-muted-foreground",
  information: "bg-primary/15 text-primary",
  warning: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  critical: "bg-destructive/15 text-destructive",
};

export default function ExploreSession() {
  const { config, timeline, addComment, started, eventsPaused, setEventsPaused, restartEvents } = useDemo();
  const sources = useMemo(() => config.sources.filter((s) => s.enabled), [config.sources]);

  const [layout, setLayout] = useState<LayoutId>("4");
  const [focusId, setFocusId] = useState(sources[0]?.id ?? "");
  const [muteAll, setMuteAll] = useState(true);
  const [comment, setComment] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    document.title = "Demo — Session Room | MAKO";
    trackDemoEvent("session_viewed");
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Scripted health transitions so the demo shows recovery behaviour.
  const health = (id: string, base: DemoHealth): DemoHealth => {
    if (!started) return "connecting";
    if (elapsed < 3) return "connecting";
    if (id === "demo-src-4") return elapsed > 30 ? "live" : base;
    return base;
  };

  const visible = useMemo(() => {
    const focusFirst = [...sources].sort((a, b) =>
      a.id === focusId ? -1 : b.id === focusId ? 1 : a.slot - b.slot,
    );
    return focusFirst.slice(0, Number(layout));
  }, [sources, layout, focusId]);

  const focused = sources.find((s) => s.id === focusId) ?? sources[0];

  const gridClass =
    layout === "1"
      ? "grid-cols-1 grid-rows-1"
      : layout === "2"
        ? "grid-cols-1 md:grid-cols-2"
        : layout === "3"
          ? "grid-cols-1 md:grid-cols-2"
          : "grid-cols-1 md:grid-cols-2 md:grid-rows-2";

  const clock = (() => {
    const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    return `00:${m}:${s}`;
  })();

  return (
    <DemoShell stage="monitor">
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/20 bg-card/30 px-3 py-2 backdrop-blur-[18px]">
          <span className="min-w-0 truncate text-xs font-medium text-foreground">{config.name}</span>
          <Badge className="border-0 bg-primary/15 text-[10px] uppercase text-primary">Live · Demo</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">Elapsed {clock}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {LAYOUTS.map((l) => (
              <Button
                key={l.id}
                size="sm"
                variant={layout === l.id ? "secondary" : "ghost"}
                disabled={sources.length < l.min}
                title={sources.length < l.min ? `Requires at least ${l.min} sources` : l.label}
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => setLayout(l.id)}
              >
                <l.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{l.label}</span>
              </Button>
            ))}
            <Button
              size="sm"
              variant={muteAll ? "secondary" : "ghost"}
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => setMuteAll((v) => !v)}
            >
              {muteAll ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{muteAll ? "Muted" : "Audio On"}</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Multiview */}
          <div className="min-w-0 space-y-3">
            <div className={`grid ${gridClass} gap-2`} style={{ aspectRatio: layout === "1" ? "16/9" : undefined }}>
              {visible.map((s, i) => (
                <div
                  key={s.id}
                  className={`min-w-0 ${layout === "3" && i === 0 ? "md:row-span-2" : ""}`}
                  style={{ aspectRatio: layout === "1" ? undefined : "16/9" }}
                >
                  <DemoFeedTile
                    source={s}
                    health={health(s.id, s.health)}
                    focused={s.id === focusId}
                    audio={!muteAll && s.id === focusId}
                    onSelect={() => setFocusId(s.id)}
                    onMaximize={() => setLayout(layout === "1" ? "4" : "1")}
                    compact={layout === "4"}
                  />
                </div>
              ))}
            </div>

            {/* Inspector */}
            {focused && (
              <section className="rounded-lg border border-border/20 bg-card/30 p-3 backdrop-blur-[18px]">
                <h2 className="mb-2 text-xs font-medium text-foreground">
                  Inspector — {focused.name}
                </h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-3">
                  {[
                    ["Codec", focused.inspector.codec],
                    ["Resolution", focused.inspector.resolution],
                    ["Frame rate", focused.inspector.frameRate],
                    ["Scan", focused.inspector.scanType],
                    ["Bitrate", `${focused.inspector.bitrate.toFixed(1)} Mbps`],
                    ["Packet loss", `${focused.inspector.packetLoss}%`],
                    ["RTT", `${focused.inspector.rtt} ms`],
                    ["Audio", `${focused.inspector.audio} · ${focused.inspector.sampleRate}`],
                    ["Loudness", focused.inspector.loudness],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-muted-foreground/70">{k}</dt>
                      <dd className="truncate text-foreground/90">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>

          {/* Timeline */}
          <aside className="flex min-w-0 flex-col rounded-lg border border-border/20 bg-card/30 backdrop-blur-[18px]">
            <div className="flex items-center gap-2 border-b border-border/10 px-3 py-2">
              <h2 className="text-xs font-medium text-foreground">Timeline</h2>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 gap-1 text-[10px]"
                onClick={() => {
                  setEventsPaused(!eventsPaused);
                  if (eventsPaused) restartEvents();
                }}
              >
                {eventsPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                {eventsPaused ? "Resume events" : "Pause events"}
              </Button>
            </div>

            <form
              className="flex gap-1.5 border-b border-border/10 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                addComment(comment.trim(), focusId || null);
                setComment("");
                trackDemoEvent("timeline_comment_added");
              }}
            >
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a demo comment…"
                aria-label="Add a demo comment"
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" className="h-8 text-[11px]">Post</Button>
            </form>

            <ScrollArea className="max-h-[420px] flex-1">
              <ul className="space-y-1.5 p-2">
                {timeline.map((e) => (
                  <li key={e.id} className="rounded border border-border/10 bg-muted/10 p-2">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge className={`${SEVERITY_CLASS[e.severity]} border-0 text-[10px] uppercase`}>
                        {e.severity}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{e.authorName}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground/90">{e.message}</p>
                    {e.sourceName && (
                      <button
                        type="button"
                        onClick={() => e.sourceId && setFocusId(e.sourceId)}
                        className="mt-1 text-[10px] text-primary hover:underline"
                      >
                        {e.sourceName}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </aside>
        </div>

        <div className="flex justify-end">
          <Button asChild className="gap-2">
            <Link to="/explore/ops">
              Continue to Operations <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </DemoShell>
  );
}
