import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users, Circle } from "lucide-react";
import type { SessionViewer } from "@/lib/session-store";
import { cn } from "@/lib/utils";

interface Props {
  viewers: SessionViewer[];
  className?: string;
  align?: "start" | "center" | "end";
  triggerAs?: "chip" | "count";
  onClick?: (e: React.MouseEvent) => void;
}

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const ViewersPanel = ({ viewers, className, align = "end", triggerAs = "chip", onClick }: Props) => {
  const count = viewers.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs rounded-md transition-colors",
            triggerAs === "chip"
              ? "px-2 py-1 border border-border/30 bg-muted/20 hover:bg-muted/40 text-foreground/80"
              : "text-muted-foreground hover:text-foreground",
            className
          )}
        >
          <Users className="h-3 w-3" />
          <span className="tabular-nums">{count}</span>
          <span>{count === 1 ? "Viewer" : "Viewers"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="mako-glass-solid border-border/30 w-64 p-0">
        <div className="px-3 py-2 border-b border-border/20">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Currently Watching
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {viewers.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">No viewers yet.</p>
          )}
          {viewers.map((v) => (
            <div key={v.userId} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/20">
              <div className="h-7 w-7 rounded-full bg-primary/15 border border-primary/25 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
                {initials(v.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-medium text-foreground truncate">{v.name}</span>
                  {v.isOwner && (
                    <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 border border-primary/25 rounded px-1 py-[1px] shrink-0">
                      Owner
                    </span>
                  )}
                </div>
                {v.focus && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Circle className="h-1.5 w-1.5 fill-primary text-primary" />
                    <span className="text-[10px] text-muted-foreground truncate">
                      focused on {v.focus}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ViewersPanel;
