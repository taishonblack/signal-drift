import { Link } from "react-router-dom";
import { Clock, Radio, Download, Users, Circle } from "lucide-react";
import type { SessionRecord } from "@/lib/session-store";
import { formatDuration, formatStartedTime } from "@/lib/session-store";
import SessionStatusBadge from "@/components/session/SessionStatusBadge";
import ViewersPanel from "@/components/session/ViewersPanel";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Variant = "hero" | "grid" | "compact";

interface Props {
  session: SessionRecord;
  variant?: Variant;
  onClick?: () => void;
  currentUserId: string;
}

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const SessionCard = ({ session, variant = "grid", onClick, currentUserId }: Props) => {
  const sources = session.lines.filter((l) => l.enabled).length;
  const viewers = session.viewers ?? [];
  const isActive = session.status === "active";
  const isCompleted = session.status === "completed";
  const ownerName =
    (session.ownerUserId ?? session.hostUserId) === currentUserId ? "You" : session.host;

  // Owner focus (from viewer list) — small presence teaser.
  const ownerViewer = viewers.find((v) => v.isOwner);
  const focusHint = ownerViewer?.focus;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onClick?.();
  };

  const Meta = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="h-4 w-4 rounded-full bg-muted/40 text-foreground/70 text-[9px] font-semibold flex items-center justify-center">
          {initials(ownerName === "You" ? "You" : ownerName)}
        </span>
        <span className="text-foreground/70 font-medium">{ownerName}</span>
      </span>
      {session.team && <span>· {session.team}</span>}
      <span>· {sources} Source{sources === 1 ? "" : "s"}</span>
      {isActive && (
        <span className="flex items-center gap-1">
          · <Clock className="h-3 w-3" /> {formatStartedTime(session.createdAt)}
          <span className="text-muted-foreground/60">({formatDuration(session.createdAt)})</span>
        </span>
      )}
      {isCompleted && (
        <span>· {new Date(session.endedAt ?? session.createdAt).toLocaleDateString()}</span>
      )}
    </div>
  );

  if (variant === "hero") {
    return (
      <div
        onClick={handleClick}
        className="mako-glass rounded-lg p-5 cursor-pointer hover:bg-muted/15 transition-all border border-primary/20"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <SessionStatusBadge status={session.status} />
              {session.purpose && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {session.purpose}
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-foreground truncate">{session.name}</h3>
            <div className="mt-2">{Meta}</div>
            {focusHint && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Circle className="h-1.5 w-1.5 fill-primary text-primary" />
                <span className="text-foreground/70">{ownerName}</span>
                <span>is viewing</span>
                <span className="text-foreground/80">{focusHint}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <ViewersPanel viewers={viewers} />
            <span className="text-[10px] text-primary/80 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Radio className="h-3 w-3" /> Return to session
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-foreground/80 hover:bg-muted/20 hover:text-foreground transition-colors group"
      >
        <SessionStatusBadge status={session.status} className="shrink-0" />
        <span className="truncate flex-1 text-left">{session.name}</span>
        {isActive && viewers.length > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
            <Users className="h-2.5 w-2.5" />
            {viewers.length}
          </span>
        )}
        {isCompleted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Download className="h-2.5 w-2.5 text-muted-foreground/50 group-hover:text-primary shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="right">Download report</TooltipContent>
          </Tooltip>
        )}
      </button>
    );
  }

  // grid
  return (
    <div
      onClick={handleClick}
      className={cn(
        "mako-glass rounded-lg p-4 cursor-pointer transition-all group",
        isActive ? "hover:bg-muted/20 hover:-translate-y-[1px]" : "hover:bg-muted/10"
      )}
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <SessionStatusBadge status={session.status} />
            {session.purpose && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {session.purpose}
              </span>
            )}
          </div>
          <p
            className={cn(
              "text-sm font-medium truncate min-w-0",
              isCompleted ? "text-muted-foreground group-hover:text-foreground/80" : "text-foreground group-hover:text-primary"
            )}
          >
            {session.name}
          </p>
          <div className="mt-1.5">{Meta}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {isActive && <ViewersPanel viewers={viewers} />}
          {isCompleted && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                  <Download className="h-3 w-3" />
                </div>
              </TooltipTrigger>
              <TooltipContent>Download report</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionCard;
