import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SessionRecord } from "@/lib/session-store";

interface Props {
  session: SessionRecord | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const SwitchActiveSessionDialog = ({ session, onCancel, onConfirm }: Props) => (
  <Dialog open={!!session} onOpenChange={(o) => !o && onCancel()}>
    <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-foreground text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
          You already have an active session
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground pt-1">
          You are currently monitoring{" "}
          <span className="text-foreground font-medium">{session?.name}</span>.
          Switching sessions will end your current monitoring session.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onConfirm}>
          Switch Session
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default SwitchActiveSessionDialog;
