import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Maximize2, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SignalTile from "@/components/SignalTile";
import { mockSessions } from "@/lib/mock-data";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { loadTimePrefs } from "@/lib/time-utils";
import { loadSlotMap, type SlotId, type SlotMap } from "@/lib/slot-map";
import { useWorkspacePrefs } from "@/hooks/use-workspace-prefs";

const SLOT_IDS: SlotId[] = ["A", "B", "C", "D"];

const gridStyles: Record<string, { cls: string; style: React.CSSProperties }> = {
  "1": { cls: "grid-cols-1", style: { gridTemplateRows: "minmax(0, 1fr)" } },
  "2": { cls: "grid-cols-2", style: { gridTemplateRows: "minmax(0, 1fr)" } },
  "3": { cls: "grid-cols-[2fr_1fr]", style: { gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)" } },
  "4": { cls: "grid-cols-2", style: { gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)" } },
};

/**
 * Standalone "Pop Out View" — mirrors the current SessionRoom multiview
 * layout in a detached browser window. Ephemeral state (layout, focus,
 * audio, mute) is passed via query params. Persistent state (slot order,
 * pane split percentages, time-display prefs) is hydrated from the same
 * per-session storage the main window uses, so pane sizes and source
 * names remain consistent.
 */
const LayoutPopoutPage = () => {
  const { sessionId } = useParams();
  const [search] = useSearchParams();

  const session = mockSessions.find((s) => s.id === sessionId) ?? mockSessions[0];
  const activeInputs = useMemo(() => session.inputs.filter((i) => i.enabled), [session]);
  const { getMetrics } = useLiveMetrics(session.inputs);
  const { prefs, ready: prefsReady } = useWorkspacePrefs();

  // Query-string driven ephemeral state (initial values only; user can
  // then toggle mute/focus locally inside the popout).
  const initialLayout = (search.get("layout") ?? "1") as "1" | "2" | "3" | "4";
  const initialFocus = search.get("focus") ?? activeInputs[0]?.id ?? "";
  const initialAudio = search.get("audio") ?? initialFocus;
  const initialMute = search.get("mute") === "1";

  const [focusedId, setFocusedId] = useState(initialFocus);
  const [audioId, setAudioId] = useState(initialAudio);
  const [muteAll, setMuteAll] = useState(initialMute);

  // Slot map preserved from the main window's per-session storage.
  const slotMap: SlotMap = useMemo(
    () => loadSlotMap(session.id, activeInputs.map((i) => i.id)),
    [session.id, activeInputs],
  );

  const timePrefs = useMemo(() => loadTimePrefs(session.id), [session.id]);
  const focusedInput = activeInputs.find((i) => i.id === focusedId) ?? activeInputs[0];

  useEffect(() => {
    document.title = `${session.name} · Layout — MAKO Popout`;
  }, [session.name]);

  const selectPane = (inputId: string) => {
    setFocusedId(inputId);
    setAudioId(inputId);
    setMuteAll(false);
  };

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
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

  const renderTile = (slot: SlotId) => {
    const inputId = slotMap[slot];
    const input = activeInputs.find((i) => i.id === inputId);
    if (!input) {
      return (
        <div className="min-h-0 min-w-0 rounded-lg border border-border/20 bg-muted/5 flex items-center justify-center text-[11px] text-muted-foreground">
          Empty pane
        </div>
      );
    }
    return (
      <SignalTile
        input={input}
        liveMetrics={getMetrics(input.id)}
        isFocused={focusedId === input.id}
        onFocusClick={() => selectPane(input.id)}
        isAudioSource={audioId === input.id}
        muteAll={muteAll}
        onSelectAudio={() => selectPane(input.id)}
        timePrefs={timePrefs}
        tileOriginTZ="America/Los_Angeles"
        focusedOriginTZ="America/Los_Angeles"
        sessionStartedAt={session.createdAt}
      />
    );
  };

  const effectiveMode = Math.min(parseInt(initialLayout), activeInputs.length || 1);
  const effectiveStr = effectiveMode.toString();
  const grid = gridStyles[effectiveStr] ?? gridStyles["1"];
  const slots = SLOT_IDS.slice(0, effectiveMode);

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Top strip */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20 shrink-0">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary">
            Layout Popout
          </span>
          <span className="text-sm font-medium truncate">{session.name}</span>
          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
            {effectiveMode}-up · Focused: {focusedInput?.label ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setMuteAll((m) => !m)}
            aria-label={muteAll ? "Unmute All" : "Mute All"}
          >
            {muteAll ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {muteAll ? "Muted" : "Audio"}
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

      {/* Layout grid */}
      <div className="flex-1 min-h-0 p-2">
        {activeInputs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No sources configured
          </div>
        ) : effectiveMode === 1 && focusedInput ? (
          <div className={`h-full grid ${grid.cls} gap-3`} style={grid.style}>
            <SignalTile
              input={focusedInput}
              liveMetrics={getMetrics(focusedInput.id)}
              isFocused
              isAudioSource={audioId === focusedInput.id}
              muteAll={muteAll}
              onSelectAudio={() => selectPane(focusedInput.id)}
              timePrefs={timePrefs}
              tileOriginTZ="America/Los_Angeles"
              focusedOriginTZ="America/Los_Angeles"
              sessionStartedAt={session.createdAt}
              isFullscreen
            />
          </div>
        ) : effectiveStr === "3" && prefsReady ? (
          // Preserve the main window's left/right and upper/lower splits.
          <div className="h-full flex min-h-0 min-w-0 items-stretch gap-3">
            <div
              className="min-h-0 min-w-0"
              style={{ flexBasis: `${prefs.mainSplitPct}%`, flexGrow: 0, flexShrink: 0 }}
            >
              {renderTile("A")}
            </div>
            <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-3">
              <div
                className="min-h-0 min-w-0"
                style={{ flexBasis: `${prefs.rightStackPct}%`, flexGrow: 0, flexShrink: 0 }}
              >
                {renderTile("B")}
              </div>
              <div className="flex-1 min-h-0 min-w-0">{renderTile("C")}</div>
            </div>
          </div>
        ) : (
          <div className={`h-full grid ${grid.cls} gap-3`} style={grid.style}>
            {slots.map((slot) => (
              <div key={slot} className="min-h-0 min-w-0">
                {renderTile(slot)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LayoutPopoutPage;
