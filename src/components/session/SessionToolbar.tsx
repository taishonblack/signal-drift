import { Grid2X2, Square, Columns2, LayoutDashboard, PanelRightClose, PanelRightOpen, Copy, FileText, Keyboard, Rows2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import TimeDisplayPopover from "@/components/session/TimeDisplayPopover";
import type { TimeDisplayPrefs } from "@/lib/time-utils";

export type Layout = "1" | "2" | "3" | "4";
export type CompareMode = "stacked" | "side-by-side";

const layoutIcons: Record<Layout, typeof Square> = {
  "1": Square,
  "2": Columns2,
  "3": LayoutDashboard,
  "4": Grid2X2,
};

interface SessionToolbarProps {
  sessionName: string;
  sessionStatus: string;
  sessionId: string;
  sessionPin: string;
  layout: Layout;
  onLayoutChange: (l: Layout) => void;
  compareMode: CompareMode;
  onCompareModeChange: (m: CompareMode) => void;
  timePrefs: TimeDisplayPrefs;
  onTimePrefsChange: (p: TimeDisplayPrefs) => void;
  showNotes: boolean;
  onToggleNotes: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
  showSafeArea: boolean;
  onToggleSafeArea: () => void;
}

const SHORTCUTS = [
  { keys: "1 – 4", desc: "Set Focus to Line 1–4" },
  { keys: "ESC", desc: "Exit fullscreen" },
];

const SessionToolbar = ({
  sessionName,
  sessionStatus,
  sessionId,
  sessionPin,
  layout,
  onLayoutChange,
  compareMode,
  onCompareModeChange,
  timePrefs,
  onTimePrefsChange,
  showNotes,
  onToggleNotes,
  showInspector,
  onToggleInspector,
  showSafeArea,
  onToggleSafeArea,
}: SessionToolbarProps) => {
  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/join?session=${sessionId}&pin=${sessionPin}`);
    toast({ title: "Invite link copied" });
  };

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-medium text-foreground truncate">{sessionName}</h1>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium shrink-0">
          {sessionStatus === "live" ? "LIVE" : "ENDED"}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {(Object.keys(layoutIcons) as Layout[]).map((l) => {
          const Icon = layoutIcons[l];
          return (
            <Button key={l} variant="ghost" size="icon" onClick={() => onLayoutChange(l)} className={`h-8 w-8 ${layout === l ? "text-primary bg-muted/30" : "text-muted-foreground"}`}>
              <Icon className="h-3.5 w-3.5" />
            </Button>
          );
        })}
        {layout === "2" && (
          <>
            <div className="w-px h-5 bg-border/30 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCompareModeChange(compareMode === "stacked" ? "side-by-side" : "stacked")}
              className={`h-8 w-8 ${compareMode === "side-by-side" ? "text-primary bg-muted/30" : "text-muted-foreground"}`}
              title={compareMode === "stacked" ? "Switch to Side-by-Side" : "Switch to Stacked"}
            >
              {compareMode === "stacked" ? <Columns2 className="h-3.5 w-3.5" /> : <Rows2 className="h-3.5 w-3.5" />}
            </Button>
          </>
        )}
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
        <Button variant="ghost" size="sm" onClick={copyInvite} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Copy className="h-3 w-3" /> PIN {sessionPin}
        </Button>
      </div>
    </div>
  );
};

export default SessionToolbar;
