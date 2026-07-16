import { useNavigate, useLocation } from "react-router-dom";
import { Radio } from "lucide-react";
import { useCurrentSession } from "@/hooks/use-current-session";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  collapsed?: boolean;
}

/**
 * Compact "● {session name}" shortcut in the sidebar/mobile nav.
 * Hidden when there is no current session or when already inside
 * the Session Room.
 */
const CurrentSessionIndicator = ({ collapsed }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useCurrentSession();

  const inRoom =
    location.pathname.startsWith("/session/") &&
    !location.pathname.endsWith("/configure");
  if (!session || inRoom) return null;

  const go = () => navigate(`/session/${session.id}`);

  const dot = (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  );

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
        <TooltipContent side="right">Return to {session.name}</TooltipContent>
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
        <span className="text-xs text-foreground truncate flex-1 min-w-0">
          {session.name}
        </span>
      </button>
    </div>
  );
};

export default CurrentSessionIndicator;
