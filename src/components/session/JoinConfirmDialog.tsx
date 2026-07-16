import { Radio, Users, Layers, ShieldCheck, User, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { JoinRemoteResult } from "@/lib/sessions-remote";

interface Props {
  summary: JoinRemoteResult["session"] | null;
  granted: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const JoinConfirmDialog = ({ summary, granted, onCancel, onConfirm }: Props) => {
  const open = !!summary;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="mako-glass-solid border-border/30 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            Join this live session?
          </DialogTitle>
          <DialogDescription>
            You're about to enter someone else's monitoring session.
          </DialogDescription>
        </DialogHeader>

        {summary && (
          <div className="rounded-md border border-border/20 bg-muted/10 p-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Session
              </p>
              <p className="text-sm font-medium text-foreground truncate">{summary.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{summary.id}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <User className="h-3 w-3" /> Owner
                </span>
                <span className="text-foreground truncate">{summary.owner_name}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> Viewers
                </span>
                <span className="text-foreground tabular-nums">{summary.viewer_count}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Sources
                </span>
                <span className="text-foreground tabular-nums">{summary.source_count}</span>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-md border border-border/15 bg-muted/5 px-3 py-2 text-[11px] flex items-start gap-2">
          {granted ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
              <span className="text-foreground/80">
                Persistent access granted — you can return to this session
                without re-entering the PIN.
              </span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                Joining as a Temporary Operator. Sign in to keep this session
                in your history.
              </span>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Return to verification
          </Button>
          <Button onClick={onConfirm} className="gap-1.5">
            <Radio className="h-3.5 w-3.5" /> Enter Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JoinConfirmDialog;
