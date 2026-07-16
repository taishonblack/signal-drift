import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useIdentity } from "@/lib/identity";
import type { SessionRecord } from "@/lib/session-store";

interface Props {
  open: boolean;
  session: SessionRecord | undefined;
  onDismiss: () => void; // "Continue as guest / dismiss"
  onDiscard: () => void; // hard-end without saving
}

/**
 * Shown when a guest owner ends a session. Members skip this — their
 * history is already persisted.
 */
const SaveSessionPrompt = ({ open, session, onDismiss, onDiscard }: Props) => {
  const identity = useIdentity();
  const navigate = useNavigate();

  if (identity.kind === "member") return null;

  const handleCreateAccount = () => {
    if (session) {
      try {
        localStorage.setItem(
          "mako_pending_save",
          JSON.stringify({ sessionId: session.id, savedAt: Date.now() })
        );
      } catch {
        /* noop */
      }
    }
    onDismiss();
    navigate("/account?mode=signup&claim=1");
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="mako-glass-solid border-border/20">
        <AlertDialogHeader>
          <AlertDialogTitle>Save this monitoring session?</AlertDialogTitle>
          <AlertDialogDescription>
            Create a free account to keep:
            <ul className="mt-3 space-y-1.5 pl-4 list-disc marker:text-primary/60 text-foreground/90">
              <li>Session history</li>
              <li>Incident timeline</li>
              <li>Notes</li>
              <li>Stream diagnostics</li>
              <li>Layout</li>
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={onDiscard}
            className="text-muted-foreground hover:text-destructive"
          >
            Discard Session
          </Button>
          <Button variant="outline" onClick={onDismiss}>
            Continue as Guest
          </Button>
          <AlertDialogAction onClick={handleCreateAccount}>
            Create Account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default SaveSessionPrompt;
