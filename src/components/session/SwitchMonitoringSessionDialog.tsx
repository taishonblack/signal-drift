import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SessionRecord } from "@/lib/session-store";

interface Props {
  currentSession: SessionRecord | null;
  newSession: SessionRecord | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const Block = ({ label, name, owner }: { label: string; name: string; owner: string }) => (
  <div className="rounded-md border border-border/20 bg-muted/10 px-3 py-2">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="text-xs text-foreground font-medium mt-0.5 truncate">{name}</p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Owner: {owner}</p>
  </div>
);

const SwitchMonitoringSessionDialog = ({ currentSession, newSession, onCancel, onConfirm }: Props) => {
  const open = !!currentSession && !!newSession;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
            You are currently monitoring another session
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            Joining this session will leave your current session.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 mt-2">
          {currentSession && (
            <Block
              label="Current Session"
              name={currentSession.name}
              owner={currentSession.ownerUserId === "u1" ? "You" : currentSession.host}
            />
          )}
          {newSession && (
            <Block label="New Session" name={newSession.name} owner={newSession.host} />
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Stay Here</Button>
          <Button size="sm" onClick={onConfirm}>Join New Session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SwitchMonitoringSessionDialog;
