import { AlertTriangle, Loader2, PowerOff, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  sessionName: string;
  /** True while the server end request is in flight. */
  ending: boolean;
  /** Set when MAKO could not confirm the end request. */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Explicit End Session confirmation. The browser only REQUESTS termination —
 * the server owns it. Nothing local changes until the request comes back
 * successfully, so this dialog stays open (and undismissable) while ending.
 */
const EndSessionDialog = ({
  open, sessionName, ending, error, onCancel, onConfirm,
}: Props) => (
  <Dialog open={open} onOpenChange={(o) => { if (!o && !ending) onCancel(); }}>
    <DialogContent
      className="mako-glass-solid border-border/20 sm:max-w-md"
      onEscapeKeyDown={(e) => { if (ending) e.preventDefault(); }}
      onInteractOutside={(e) => { if (ending) e.preventDefault(); }}
    >
      <DialogHeader>
        <DialogTitle className="text-foreground text-sm flex items-center gap-2">
          <PowerOff className="h-4 w-4 text-destructive" />
          End Session
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground pt-1">
          All active source connections for <span className="text-foreground">{sessionName}</span>{" "}
          will be disconnected and monitoring will end for everyone in this session.
          This cannot be undone.
        </DialogDescription>
      </DialogHeader>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-foreground"
        >
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-destructive" />
          <span>{error}</span>
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={ending}
          className="gap-2"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onConfirm}
          disabled={ending}
          aria-busy={ending}
          className="gap-2"
        >
          {ending ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Ending…</>
          ) : error ? (
            <><PowerOff className="h-3.5 w-3.5" /> Retry End Session</>
          ) : (
            <><PowerOff className="h-3.5 w-3.5" /> End Session</>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default EndSessionDialog;
