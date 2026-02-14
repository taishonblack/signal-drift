import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TimeDisplayPrefs, EventTimeSource } from "@/lib/time-utils";

interface TimeDisplayPopoverProps {
  prefs: TimeDisplayPrefs;
  onChange: (prefs: TimeDisplayPrefs) => void;
}

const TimeDisplayPopover = ({ prefs, onChange }: TimeDisplayPopoverProps) => {
  const update = (patch: Partial<TimeDisplayPrefs>) => onChange({ ...prefs, ...patch });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${prefs.showOverlay ? "text-primary" : "text-muted-foreground"} hover:text-foreground`}
          title="Time Display"
        >
          <Clock className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64 p-4 mako-glass-solid border-border/20 space-y-4">
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">Show Time Overlay</span>
          <Switch checked={prefs.showOverlay} onCheckedChange={(v) => update({ showOverlay: v })} />
        </div>

        {prefs.showOverlay && (
          <>
            {/* Clock selection */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Clocks to show</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={prefs.showEvent} onCheckedChange={(v) => update({ showEvent: !!v })} />
                <span className="text-xs text-foreground">Event (Origin)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={prefs.showViewerLocal} onCheckedChange={(v) => update({ showViewerLocal: !!v })} />
                <span className="text-xs text-foreground">Viewer Local</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={prefs.showUTC} onCheckedChange={(v) => update({ showUTC: !!v })} />
                <span className="text-xs text-foreground">UTC</span>
              </label>
            </div>

            {/* Event time source */}
            {prefs.showEvent && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Event Time Source</p>
                {([
                  { value: "per-tile" as EventTimeSource, label: "Per Tile", desc: "Each tile uses its own origin TZ" },
                  { value: "follow-focus" as EventTimeSource, label: "Follow Focus", desc: "All tiles show focused line's TZ" },
                ]).map((opt) => (
                  <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="eventTimeSource"
                      checked={prefs.eventTimeSource === opt.value}
                      onChange={() => update({ eventTimeSource: opt.value })}
                      className="mt-0.5 accent-[hsl(var(--primary))]"
                    />
                    <div>
                      <span className="text-xs text-foreground">{opt.label}</span>
                      <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Session elapsed */}
            <div className="pt-1 border-t border-border/15">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={prefs.showSessionElapsed} onCheckedChange={(v) => update({ showSessionElapsed: !!v })} />
                <span className="text-xs text-foreground">Show Session Elapsed</span>
              </label>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default TimeDisplayPopover;
