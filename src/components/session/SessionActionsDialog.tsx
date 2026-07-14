import { Radio, Settings, Lock, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SessionRecord } from "@/lib/session-store";
import {
  formatDuration, formatStartedTime, canConfigureSession,
} from "@/lib/session-store";

interface Props {
  session: SessionRecord | null;
  currentUserId: string;
  onClose: () => void;
  onJoin?: () => void;
  onConfigure: () => void;
  joinLabel?: string;
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-2 border-b border-border/15 last:border-0">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    <span className="text-xs text-foreground text-right truncate">{value}</span>
  </div>
);

const SessionActionsDialog = ({
  session, currentUserId, onClose, onJoin, onConfigure, joinLabel,
}: Props) => {
  if (!session) return null;
  const canConfigure = canConfigureSession(session, currentUserId);
  const viewers = session.viewers ?? [];
  const isActive = session.status === "active";

  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            {session.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            Choose what you want to do with this session.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 px-1">
          <Row label="Owner" value={session.host} />
          {isActive && (
            <>
              <Row label="Started" value={formatStartedTime(session.createdAt)} />
              <Row label="Duration" value={formatDuration(session.createdAt)} />
              <Row
                label="Watching"
                value={`${viewers.length} Operator${viewers.length === 1 ? "" : "s"}`}
              />
            </>
          )}
          {session.purpose && <Row label="Purpose" value={session.purpose} />}
        </div>

        <div className="flex flex-col gap-2 mt-3">
          {onJoin && isActive && (
            <Button size="sm" onClick={onJoin} className="gap-2">
              <Radio className="h-3.5 w-3.5" /> {joinLabel ?? "Join Live Session"}
            </Button>
          )}
          {canConfigure ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onConfigure}
              className="gap-2 border-border/30 text-foreground"
            >
              <Settings className="h-3.5 w-3.5" /> Configure Session
            </Button>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-border/20 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Only the session owner or team administrators can modify this session.
              </span>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SessionActionsDialog;
