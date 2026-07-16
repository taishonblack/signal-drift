import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const COUNTDOWN_SECONDS = 30;

interface Props {
  open: boolean;
  noOwnerSince: number | null;
  onClaim: () => void;
  onLeave: () => void;
  onCountdownExpired: () => void;
}

/**
 * "Owner Left Session" dialog — every remaining viewer sees this the moment
 * the session becomes ownerless. First to click Become Owner wins.
 * If no one claims within COUNTDOWN_SECONDS, the countdown fires and the
 * session terminates.
 */
const OwnerLeftDialog = ({
  open,
  noOwnerSince,
  onClaim,
  onLeave,
  onCountdownExpired,
}: Props) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [open]);

  const secondsLeft = noOwnerSince
    ? Math.max(0, Math.ceil((noOwnerSince + COUNTDOWN_SECONDS * 1000 - now) / 1000))
    : COUNTDOWN_SECONDS;

  useEffect(() => {
    if (open && secondsLeft <= 0) onCountdownExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, secondsLeft]);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="mako-glass-solid border-border/20">
        <AlertDialogHeader>
          <AlertDialogTitle>Owner Left Session</AlertDialogTitle>
          <AlertDialogDescription>
            The session owner has disconnected. Would you like to become the new
            owner? Monitoring will continue uninterrupted.
            <span className="block mt-3 text-xs">
              No owner assigned. This monitoring session will end in{" "}
              <span className="text-primary font-semibold tabular-nums">
                {secondsLeft}s
              </span>
              .
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onLeave}>Leave Session</AlertDialogCancel>
          <AlertDialogAction onClick={onClaim}>Become Owner</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default OwnerLeftDialog;
