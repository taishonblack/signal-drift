import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, QrCode, RefreshCw, Share2, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ShareSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionName: string;
  pin: string | null;
  isOwner: boolean;
  onRegeneratePin?: () => Promise<void> | void;
}

const buildJoinLink = (sessionId: string) =>
  `${window.location.origin}/join/${sessionId}`;

const buildInviteMessage = (
  sessionId: string,
  sessionName: string,
  pin: string | null,
) => {
  const link = buildJoinLink(sessionId);
  const pinLine = pin ? `PIN: ${pin}\n` : "";
  return `Join my MAKO monitoring session:\n${sessionName}\n\nSession ID: ${sessionId}\n${pinLine}\nJoin:\n${link}`;
};

const ShareSessionDialog = ({
  open,
  onOpenChange,
  sessionId,
  sessionName,
  pin,
  isOwner,
  onRegeneratePin,
}: ShareSessionDialogProps) => {
  const [showQr, setShowQr] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [pinRevealed, setPinRevealed] = useState(false);

  const joinLink = buildJoinLink(sessionId);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Could not copy ${label}` });
    }
  };

  const handleRegenerate = async () => {
    if (!onRegeneratePin) return;
    setRegenBusy(true);
    try {
      await onRegeneratePin();
      toast({ title: "New PIN generated", description: "Previous PIN no longer works for new joins." });
    } catch (e) {
      toast({ title: "Could not regenerate PIN", description: e instanceof Error ? e.message : undefined });
    } finally {
      setRegenBusy(false);
      setRegenOpen(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="mako-glass-solid border-border/20 p-0 gap-0 w-[calc(100vw-24px)] sm:w-[600px] sm:max-w-[calc(100vw-48px)] max-h-[85vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 space-y-2 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4 text-primary" /> Share Session
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Participants need both the Session ID and PIN to join.
            </DialogDescription>
          </DialogHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4 border-t border-border/20 pt-5">
            {/* Session name */}
            <div className="rounded-md border border-border/30 bg-muted/10 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
                Session Name
              </div>
              <div className="text-sm text-foreground truncate">{sessionName}</div>
            </div>

            {/* Session ID + PIN, 2-col on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldRow label="Session ID">
                <span className="flex-1 min-w-0 font-mono text-sm text-foreground truncate">
                  {sessionId}
                </span>
                <IconBtn onClick={() => copy(sessionId, "Session ID")} title="Copy Session ID">
                  <Copy className="h-3.5 w-3.5" />
                </IconBtn>
              </FieldRow>

              <FieldRow label="PIN">
                {pin ? (
                  <>
                    <span className="flex-1 min-w-0 font-mono text-sm text-foreground truncate">
                      {pinRevealed ? pin : "••••"}
                    </span>
                    <IconBtn
                      onClick={() => setPinRevealed((v) => !v)}
                      title={pinRevealed ? "Hide PIN" : "Show PIN"}
                    >
                      {pinRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </IconBtn>
                    <IconBtn onClick={() => copy(pin, "PIN")} title="Copy PIN">
                      <Copy className="h-3.5 w-3.5" />
                    </IconBtn>
                  </>
                ) : (
                  <span className="flex-1 text-[11px] text-muted-foreground">
                    Owner-only
                  </span>
                )}
              </FieldRow>
            </div>

            {!pin && (
              <div className="rounded-md border border-border/30 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
                Only the session owner can view the PIN. Ask them to share it directly.
              </div>
            )}

            {/* Join Link full width */}
            <FieldRow label="Join Link">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-1 min-w-0 font-mono text-[11px] text-foreground truncate cursor-default">
                    {joinLink}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[90vw] break-all font-mono text-[11px]">
                  {joinLink}
                </TooltipContent>
              </Tooltip>
              <IconBtn onClick={() => copy(joinLink, "Join link")} title="Copy join link">
                <Copy className="h-3.5 w-3.5" />
              </IconBtn>
            </FieldRow>

            {/* QR inline */}
            {showQr && (
              <div className="flex flex-col items-center gap-2 rounded-md border border-border/30 bg-white/95 p-4">
                <QRCodeSVG value={joinLink} size={180} level="M" includeMargin={false} />
                <p className="text-[10px] text-black/70 text-center max-w-[240px]">
                  Scan to open the join page. The PIN must still be entered separately.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border/20 px-6 py-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:items-center">
              {isOwner && onRegeneratePin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive w-full sm:w-auto"
                  onClick={() => setRegenOpen(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Regenerate PIN
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 w-full sm:w-auto"
                onClick={() => setShowQr((v) => !v)}
              >
                <QrCode className="h-3.5 w-3.5" /> {showQr ? "Hide QR" : "Show QR"}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 w-full sm:w-auto"
                onClick={() => copy(buildInviteMessage(sessionId, sessionName, pin), "Invite")}
              >
                <Copy className="h-3.5 w-3.5" /> Copy Invite
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent className="mako-glass-solid border-border/20">
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Session PIN?</AlertDialogTitle>
            <AlertDialogDescription>
              The previous PIN will stop working for new participants. Current authorized viewers will remain connected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate} disabled={regenBusy}>
              {regenBusy ? "Regenerating…" : "Regenerate PIN"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
}

const FieldRow = ({ label, children }: FieldRowProps) => (
  <div className="space-y-1 min-w-0">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
      {label}
    </div>
    <div className="flex items-center gap-1.5 rounded-md border border-border/30 bg-muted/20 px-3 py-2 h-10 min-w-0">
      {children}
    </div>
  </div>
);

const IconBtn = ({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) => (
  <Button
    size="icon"
    variant="ghost"
    className="h-7 w-7 shrink-0"
    onClick={onClick}
    title={title}
  >
    {children}
  </Button>
);

export default ShareSessionDialog;
