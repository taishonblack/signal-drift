import { Crown } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  previousOwner?: string;
  onBecomeOwner: () => void;
  onLeave: () => void;
}

const OwnershipTransferDialog = ({ open, previousOwner, onBecomeOwner, onLeave }: Props) => (
  <Dialog open={open} onOpenChange={() => { /* modal — force decision */ }}>
    <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md" onEscapeKeyDown={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle className="text-foreground text-sm flex items-center gap-2">
          <Crown className="h-4 w-4 text-[hsl(var(--warning))]" />
          The session owner has left
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground pt-1">
          {previousOwner ? `${previousOwner} left the session. ` : ""}
          Would you like to become the new owner?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button variant="ghost" size="sm" onClick={onLeave}>Leave Session</Button>
        <Button size="sm" onClick={onBecomeOwner}>Become Owner</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default OwnershipTransferDialog;
