import { useLocation, useNavigate } from "react-router-dom";
import { Radio, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";

/**
 * Persistent "Active Session Return Bar".
 * Reads from the central Current Session store and disappears
 * automatically when the session ends.
 *
 * Hidden on:
 *  - The active Session Room itself (/session/:id, not /configure)
 *  - Fullscreen mode (?fullscreen=1)
 *  - The public landing page
 */
const ActiveSessionReturnBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, isTemporary, currentUserId } = useCurrentSession();

  // Path exclusions
  const path = location.pathname;
  const inSessionRoom =
    path.startsWith("/session/") && !path.endsWith("/configure");
  const isLanding = path === "/";
  const isFullscreen =
    new URLSearchParams(location.search).get("fullscreen") === "1";

  if (!session || inSessionRoom || isLanding || isFullscreen) return null;

  const isOwner =
    (session.ownerUserId ?? session.hostUserId) === currentUserId;
  const activeSources = session.lines.filter((l) => l.enabled).length;
  const totalSources = session.lines.length;
  const viewers = session.viewers?.length ?? 0;

  const roleLabel = isTemporary
    ? "Temporary Session"
    : isOwner
      ? "Owner: You"
      : "Viewing";

  return (
    <div
      role="region"
      aria-label="Active session return bar"
      className="border-b border-border/20 bg-primary/[0.04] backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 px-4 py-2 md:py-2.5 max-w-full">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary hidden sm:inline">
            Live Session
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary sm:hidden">
            Live
          </span>
        </div>

        <div className="h-4 w-px bg-border/30 hidden sm:block" />

        {/* Session name + meta */}
        <div className="min-w-0 flex-1">
          <p className="text-xs md:text-sm font-medium text-foreground truncate">
            {session.name}
          </p>
          <p className="text-[10px] text-muted-foreground truncate hidden sm:block">
            {activeSources} of {totalSources} Sources Active
            {viewers > 0 && ` · ${viewers} viewer${viewers === 1 ? "" : "s"}`}
            {` · ${roleLabel}`}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => navigate(`/session/${session.id}`)}
          >
            <Radio className="h-3 w-3" />
            <span className="hidden sm:inline">Return to Session</span>
            <span className="sm:hidden">Return</span>
          </Button>
          {path !== "/ops" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground hidden md:inline-flex"
              onClick={() => navigate("/ops")}
            >
              <Activity className="h-3 w-3" />
              Open Ops
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActiveSessionReturnBar;
