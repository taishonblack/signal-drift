import { History } from "lucide-react";
import type { SessionChangeEntry } from "@/lib/session-store";
import { cn } from "@/lib/utils";

interface Props {
  entries: SessionChangeEntry[];
  className?: string;
  emptyLabel?: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const SessionChangeLogPanel = ({ entries, className, emptyLabel }: Props) => {
  const reversed = [...entries].reverse();
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        <History className="h-3 w-3" /> Session Change Log
      </div>
      {reversed.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60">
          {emptyLabel ?? "No configuration changes yet."}
        </p>
      ) : (
        <ol className="space-y-2">
          {reversed.map((e) => (
            <li
              key={e.id}
              className="rounded-md border border-border/15 bg-muted/8 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium text-foreground">
                  {e.userName}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {fmt(e.at)}
                </span>
              </div>
              <p className="text-[11px] text-foreground/80 mt-0.5">{e.summary}</p>
              {(e.before || e.after) && e.before !== e.after && (
                <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                  {e.before && (
                    <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive/80 line-through">
                      {e.before}
                    </span>
                  )}
                  {e.after && (
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {e.after}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default SessionChangeLogPanel;
