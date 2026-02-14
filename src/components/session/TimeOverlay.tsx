import { useState, useEffect } from "react";
import { formatTimeInZone, formatElapsed, getViewerTimeZone } from "@/lib/time-utils";
import type { TimeDisplayPrefs } from "@/lib/time-utils";

interface TimeOverlayProps {
  prefs: TimeDisplayPrefs;
  /** Origin TZ for this specific tile */
  tileOriginTZ: string;
  /** Origin TZ of the focused tile (for follow-focus mode) */
  focusedOriginTZ: string;
  /** Session start ISO string for elapsed time */
  sessionStartedAt: string;
}

const TimeOverlay = ({ prefs, tileOriginTZ, focusedOriginTZ, sessionStartedAt }: TimeOverlayProps) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!prefs.showOverlay) return null;

  const viewerTZ = getViewerTimeZone();
  const eventTZ = prefs.eventTimeSource === "follow-focus" ? focusedOriginTZ : tileOriginTZ;
  const hasAnyClock = prefs.showEvent || prefs.showViewerLocal || prefs.showUTC || prefs.showSessionElapsed;

  if (!hasAnyClock) return null;

  return (
    <div
      className="absolute bottom-2 left-2 flex flex-col gap-px px-2 py-1.5 rounded text-[10px] font-mono leading-tight z-10"
      style={{
        background: "hsla(205, 55%, 8%, 0.82)",
        backdropFilter: "blur(12px)",
        border: "1px solid hsla(200, 30%, 100%, 0.04)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {prefs.showEvent && (
        <div className="flex items-center gap-1.5">
          <span className="text-primary/70 w-7">EVT</span>
          <span className="text-foreground/80">{formatTimeInZone(now, eventTZ)}</span>
        </div>
      )}
      {prefs.showViewerLocal && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground w-7">LOC</span>
          <span className="text-foreground/80">{formatTimeInZone(now, viewerTZ)}</span>
        </div>
      )}
      {prefs.showUTC && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground w-7">UTC</span>
          <span className="text-foreground/80">{formatTimeInZone(now, "UTC")}</span>
        </div>
      )}
      {prefs.showSessionElapsed && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground w-7">ELP</span>
          <span className="text-foreground/80">{formatElapsed(sessionStartedAt)}</span>
        </div>
      )}
    </div>
  );
};

export default TimeOverlay;
