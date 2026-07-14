import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Radio } from "lucide-react";
import type { SessionRecord } from "@/lib/session-store";
import { formatDuration, formatStartedTime } from "@/lib/session-store";

interface Props {
  session: SessionRecord | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-2 border-b border-border/15 last:border-0">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    <span className="text-xs text-foreground text-right truncate">{value}</span>
  </div>
);

const JoinActiveSessionDialog = ({ session, onCancel, onConfirm }: Props) => {
  if (!session) return null;
  const viewers = session.viewers ?? [];
  const count = viewers.length;
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            Join Active Session
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            You are about to join an active monitoring session.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 px-1">
          <Row label="Session" value={session.name} />
          <Row label="Owner" value={session.host} />
          <Row label="Current Viewers" value={`${count} Operator${count === 1 ? "" : "s"}`} />
          <Row label="Started" value={formatStartedTime(session.createdAt)} />
          <Row label="Duration" value={formatDuration(session.createdAt)} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onConfirm}>Join Session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JoinActiveSessionDialog;
