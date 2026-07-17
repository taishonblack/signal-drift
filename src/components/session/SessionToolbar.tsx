import { Grid2X2, Square, LayoutDashboard, PanelRightClose, PanelRightOpen, Share2, FileText, Keyboard, Rows2, ScanLine, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import TimeDisplayPopover from "@/components/session/TimeDisplayPopover";
import type { TimeDisplayPrefs } from "@/lib/time-utils";
import { useIsMobile } from "@/hooks/use-mobile";

export type Layout = "1" | "2" | "3" | "4";
export type CompareMode = "stacked"; // kept for type compat

const layoutIcons: Record<Layout, typeof Square> = {
  "1": Square,
  "2": Rows2,
  "3": LayoutDashboard,
  "4": Grid2X2,
};

/** Minimum configured sources required to enable each layout. */
const layoutMinSources: Record<Layout, number> = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
};

interface SessionToolbarProps {
  sessionName: string;
  sessionStatus: string;
  sessionId: string;
  layout: Layout;
  onLayoutChange: (l: Layout) => void;
  timePrefs: TimeDisplayPrefs;
  onTimePrefsChange: (p: TimeDisplayPrefs) => void;
  showNotes: boolean;
  onToggleNotes: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
  showSafeArea: boolean;
  onToggleSafeArea: () => void;
  onShare: () => void;
  /** Number of configured (enabled) sources — drives layout button availability. */
  configuredCount: number;
}

const SHORTCUTS = [
  { keys: "1 – 4", desc: "Set Focus to Line 1–4" },
  { keys: "Dbl-click", desc: "Maximize / restore tile" },
  { keys: "M", desc: "Toggle Mute All" },
  { keys: "ESC", desc: "Exit fullscreen / maximize" },
];


const SessionToolbar = ({
  sessionName,
  sessionStatus,
  sessionId,
  layout,
  onLayoutChange,
  timePrefs,
  onTimePrefsChange,
  showNotes,
  onToggleNotes,
  showInspector,
  onToggleInspector,
  showSafeArea,
  onToggleSafeArea,
  onShare,
  configuredCount,
}: SessionToolbarProps) => {
  const isMobile = useIsMobile();

  return (
    <div className="w-full min-w-0 overflow-hidden space-y-1">
      {/* Title block */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <h1 className="text-sm font-medium text-foreground truncate min-w-0">{sessionName}</h1>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium shrink-0">
            {sessionStatus === "live" ? "LIVE" : "ENDED"}
          </span>
        </div>
        {/* Desktop: Share Session in header row */}
        {!isMobile && (
          <Button
            variant="outline"
            size="sm"
            onClick={onShare}
            className="gap-1.5 text-xs border-border/40 shrink-0"
            title={`Session ID: ${sessionId}`}
          >
            <Share2 className="h-3.5 w-3.5" /> Share Session
          </Button>
        )}
      </div>

      {/* Mobile subtitle: Session ID + Share */}
      {isMobile && (
        <button
          onClick={onShare}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Share2 className="h-3 w-3" />
          <span className="font-mono">{sessionId}</span>
          <span className="text-muted-foreground/60">· Share</span>
        </button>
      )}


      {/* Icon toolbar */}
      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
        {(Object.keys(layoutIcons) as Layout[]).map((l) => {
          const Icon = layoutIcons[l];
          const needed = layoutMinSources[l];
          const disabled = configuredCount < needed;
          const isActive = layout === l;
          const tip = disabled
            ? needed === 2
              ? "Requires at least 2 configured sources"
              : needed === 3
              ? "Requires at least 3 configured sources"
              : "Requires 4 configured sources"
            : `${needed}-source layout`;
          return (
            <Button
              key={l}
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => !disabled && onLayoutChange(l)}
              title={tip}
              aria-label={tip}
              className={`h-8 w-8 ${isActive ? "text-primary bg-muted/30" : "text-muted-foreground"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          );
        })}
        <div className="w-px h-5 bg-border/30 mx-1" />
        <TimeDisplayPopover prefs={timePrefs} onChange={onTimePrefsChange} />
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSafeArea}
          className={`h-8 w-8 ${showSafeArea ? "text-primary bg-muted/30" : "text-muted-foreground"}`}
          title="Safe area overlay"
        >
          <ScanLine className="h-3.5 w-3.5" />
        </Button>
        {/* Desktop: show all icons inline */}
        {!isMobile && (
          <>
            <Button variant="ghost" size="icon" onClick={onToggleNotes} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <FileText className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onToggleInspector} className={`h-8 w-8 ${showInspector ? "text-primary" : "text-muted-foreground"}`}>
              {showInspector ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <Keyboard className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-56 p-3 mako-glass-solid border-border/20">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Keyboard Shortcuts</p>
                <div className="space-y-1.5 text-xs">
                  {SHORTCUTS.map((s) => (
                    <div key={s.keys} className="flex items-center justify-between gap-2">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/30 text-foreground font-mono text-[10px] border border-border/20">{s.keys}</kbd>
                      <span className="text-muted-foreground text-[11px]">{s.desc}</span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
        {/* Mobile: overflow menu for Notes, Inspector, Shortcuts */}
        {isMobile && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-44 p-2 mako-glass-solid border-border/20">
              <div className="space-y-0.5">
                <button onClick={onToggleNotes} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-foreground/80 hover:bg-muted/20 transition-colors">
                  <FileText className="h-3.5 w-3.5" /> {showNotes ? "Hide Notes" : "Show Notes"}
                </button>
                <button onClick={onToggleInspector} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-foreground/80 hover:bg-muted/20 transition-colors">
                  {showInspector ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                  {showInspector ? "Hide Inspector" : "Show Inspector"}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
};

export default SessionToolbar;
