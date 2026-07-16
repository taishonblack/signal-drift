import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Copy, QrCode, RefreshCw, Share2, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ShareSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionName: string;
  pin: string | null; // null when viewer/no permission to see PIN
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4 text-primary" /> Share Session
            </DialogTitle>
            <DialogDescription className="text-xs">
              Participants need both the Session ID and PIN to join.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Field label="Session Name" value={sessionName} onCopy={() => copy(sessionName, "Session name")} />
            <Field label="Session ID" value={sessionId} onCopy={() => copy(sessionId, "Session ID")} mono />
            {pin ? (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  PIN
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border/30 bg-muted/20 px-3 py-2">
                  <span className="font-mono text-sm text-foreground flex-1">
                    {pinRevealed ? pin : "••••"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPinRevealed((v) => !v)}
                    title={pinRevealed ? "Hide PIN" : "Show PIN"}
                  >
                    {pinRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => copy(pin, "PIN")}
                    title="Copy PIN"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border/30 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
                Only the session owner can view the PIN. Ask them to share it directly.
              </div>
            )}
            <Field
              label="Join Link"
              value={joinLink}
              onCopy={() => copy(joinLink, "Join link")}
              mono
              small
            />

            {showQr && (
              <div className="flex flex-col items-center gap-2 rounded-md border border-border/30 bg-white/95 p-3">
                <QRCodeSVG value={joinLink} size={168} level="M" includeMargin={false} />
                <p className="text-[10px] text-black/70 text-center max-w-[220px]">
                  Scan to open the join page. The PIN must still be entered separately.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:mr-auto">
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => copy(buildInviteMessage(sessionId, sessionName, pin), "Invite")}
              >
                <Copy className="h-3.5 w-3.5" /> Copy Invite
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowQr((v) => !v)}
              >
                <QrCode className="h-3.5 w-3.5" /> {showQr ? "Hide QR" : "Show QR"}
              </Button>
              {isOwner && onRegeneratePin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setRegenOpen(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Regenerate PIN
                </Button>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
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
    </>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onCopy: () => void;
  mono?: boolean;
  small?: boolean;
}

const Field = ({ label, value, onCopy, mono, small }: FieldProps) => (
  <div className="space-y-1">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
      {label}
    </div>
    <div className="flex items-center gap-2 rounded-md border border-border/30 bg-muted/20 px-3 py-2">
      <span
        className={`flex-1 text-foreground truncate ${mono ? "font-mono" : ""} ${small ? "text-[11px]" : "text-sm"}`}
      >
        {value}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onCopy}
        title={`Copy ${label.toLowerCase()}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
);

export default ShareSessionDialog;
