import { useNavigate, useLocation } from "react-router-dom";
import { useCurrentSession } from "@/hooks/use-current-session";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  collapsed?: boolean;
}

/**
 * Compact live/idle indicator for the sidebar. Reads from the same
 * Current Session store as the return bar so both stay in sync.
 */
const CurrentSessionIndicator = ({ collapsed }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, isIdle, msUntilIdleEnd } = useCurrentSession(1000);

  const inRoom =
    location.pathname.startsWith("/session/") &&
    !location.pathname.endsWith("/configure");
  if (!session || inRoom) return null;

  const go = () => navigate(`/session/${session.id}`);

  const dotColor = isIdle ? "bg-[hsl(var(--warning))]" : "bg-primary";
  const dotPingColor = isIdle
    ? "bg-[hsl(var(--warning))]/60"
    : "bg-primary/60";

  const dot = (
    <span className="relative flex h-2 w-2 shrink-0">
      {!isIdle && (
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotPingColor} opacity-75`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
    </span>
  );

  const endsInMs = msUntilIdleEnd ?? 0;
  const endsInMins = Math.floor(endsInMs / 60_000);
  const endsInSecs = Math.floor((endsInMs % 60_000) / 1000);
  const countdown = `${endsInMins}:${String(endsInSecs).padStart(2, "0")}`;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={go}
            aria-label={`Return to ${session.name}`}
            className="w-full flex items-center justify-center py-2 rounded-md hover:bg-muted/30 transition-colors"
          >
            {dot}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {isIdle
            ? `Idle — ends in ${countdown} · ${session.name}`
            : `Return to ${session.name}`}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="px-2 pt-1">
      <p className="px-2 pb-1 text-[9px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
        Current Session
      </p>
      <button
        onClick={go}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors text-left"
      >
        {dot}
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-foreground truncate">
            {session.name}
          </span>
          {isIdle && (
            <span className="block text-[10px] text-[hsl(var(--warning))] font-mono">
              Idle · ends in {countdown}
            </span>
          )}
        </span>
      </button>
    </div>
  );
};

export default CurrentSessionIndicator;
