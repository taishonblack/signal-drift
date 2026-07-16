import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Radio, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentSession } from "@/hooks/use-current-session";
import { formatDuration } from "@/lib/session-store";
import {
  formatEndsAt,
  formatRemaining,
  formatRemainingShort,
  getTimingState,
  msRemaining,
} from "@/lib/session-timing";

/**
 * Persistent "Active Session Return Bar".
 * Reads from the central Current Session store. Remains visible for the
 * entire lifetime of the session (active or idle) except in the Session
 * Room itself, fullscreen mode, and the public landing page. Disappears
 * only when the session ends, access is lost, or the session is destroyed.
 */
const ActiveSessionReturnBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, isTemporary, currentUserId, isIdle, msUntilIdleEnd } =
    useCurrentSession();

  // Tick every second so scheduled-end countdown stays live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

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
  const now = Date.now();
  const freshViewers = (session.viewers ?? []).filter(
    (v) => v.lastHeartbeatAt && now - v.lastHeartbeatAt < 90_000,
  ).length;
  const totalViewers = session.viewers?.length ?? 0;
  const viewersShown = isIdle ? freshViewers : (freshViewers || totalViewers);

  const roleLabel = isTemporary
    ? "Temporary Session"
    : isOwner
      ? "Owner: You"
      : "Viewing";

  const uptime = formatDuration(session.createdAt);

  // Scheduled-end (authoritative). Independent from idle countdown.
  const scheduledEndAt = session.scheduledEndAt ?? null;
  const endsAtLabel = scheduledEndAt
    ? formatEndsAt(scheduledEndAt, session.defaultOriginTimeZone)
    : "";
  const scheduledRemainingMs = msRemaining(scheduledEndAt);
  const scheduledRemainingLabel = scheduledEndAt ? formatRemaining(scheduledRemainingMs) : "";
  const scheduledRemainingShort = scheduledEndAt
    ? formatRemainingShort(scheduledRemainingMs)
    : "";
  const timingState = getTimingState(scheduledEndAt);
  const scheduledToneClass =
    timingState === "finalMinutes" || timingState === "reached"
      ? "text-[hsl(var(--destructive))]"
      : timingState === "endingSoon"
        ? "text-[hsl(var(--warning))]"
        : "text-foreground";

  // Idle timeout (separate clock, only when idle).
  const idleMs = msUntilIdleEnd ?? 0;
  const idleMins = Math.floor(idleMs / 60_000);
  const idleSecs = Math.floor((idleMs % 60_000) / 1000);
  const idleLabel = `${idleMins}:${String(idleSecs).padStart(2, "0")}`;


  const dotColor = isIdle ? "bg-[hsl(var(--warning))]" : "bg-primary";
  const dotPingColor = isIdle
    ? "bg-[hsl(var(--warning))]/60"
    : "bg-primary/60";
  const bgTone = isIdle
    ? "bg-[hsl(var(--warning))]/[0.06]"
    : "bg-primary/[0.04]";
  const statusLabel = isIdle ? "IDLE" : "LIVE";

  return (
    <div
      role="region"
      aria-label="Active session return bar"
      className={`border-b border-border/20 ${bgTone} backdrop-blur-sm`}
    >
      <div className="flex items-center gap-3 px-4 py-2 md:py-2.5 max-w-full">
        {/* Status indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2 w-2">
            {!isIdle && (
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotPingColor} opacity-75`}
              />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`}
            />
          </span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              isIdle ? "text-[hsl(var(--warning))]" : "text-primary"
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="h-4 w-px bg-border/30 hidden sm:block" />

        {/* Session name + meta */}
        <div className="min-w-0 flex-1">
          <p className="text-xs md:text-sm font-medium text-foreground truncate">
            {session.name}
          </p>
          <p className="text-[10px] text-muted-foreground truncate hidden sm:block">
            {isIdle ? (
              <>
                No viewers · Idle timeout{" "}
                <span className="font-mono text-foreground">{idleLabel}</span>
                {scheduledEndAt && (
                  <>
                    {" "}· Scheduled end{" "}
                    <span className={`font-mono ${scheduledToneClass}`}>{endsAtLabel}</span>
                  </>
                )}
              </>
            ) : (
              <>
                {activeSources} of {totalSources} Sources ·{" "}
                {viewersShown} viewer{viewersShown === 1 ? "" : "s"} ·{" "}
                <span className="font-mono">{uptime}</span> · {roleLabel}
                {scheduledEndAt && (
                  <>
                    {" "}· Ends at{" "}
                    <span className={`font-mono ${scheduledToneClass}`}>{endsAtLabel}</span>{" "}
                    (<span className="font-mono">{scheduledRemainingLabel}</span> remaining)
                  </>
                )}
              </>
            )}
          </p>
          <p className="text-[10px] text-muted-foreground truncate sm:hidden">
            {isIdle ? (
              <>
                Idle{" "}
                <span className="font-mono text-foreground">{idleLabel}</span>
              </>
            ) : scheduledEndAt ? (
              <span className={`font-mono ${scheduledToneClass}`}>{scheduledRemainingShort}</span>
            ) : (
              <>
                {viewersShown} viewer{viewersShown === 1 ? "" : "s"} ·{" "}
                <span className="font-mono">{uptime}</span>
              </>
            )}
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
