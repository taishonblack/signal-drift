import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, StickyNote, RefreshCw, X } from "lucide-react";
import type { Session } from "@/lib/mock-data";
import { generateSessionReportPDF } from "@/lib/session-report-pdf";

interface Props {
  session: Session | null;
  /** If true, show "Reconfigure and Start" — reserved for the session owner. */
  isOwner?: boolean;
  onClose: () => void;
}

const ExpiredSessionDialog = ({ session, isOwner, onClose }: Props) => {
  const navigate = useNavigate();

  const handleDownload = () => {
    if (session) generateSessionReportPDF(session);
    onClose();
  };

  const handleReconfigure = () => {
    if (!session) return;
    onClose();
    navigate(`/create?reuse=${session.id}`);
  };

  return (
    <AlertDialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="mako-glass-solid border-border/30 max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Ended session</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground leading-relaxed">
            This session is no longer live and MAKO does not record streams.
            You can download a technical report with incidents, metrics, notes, and markers
            {isOwner ? ", or reconfigure the same sources into a fresh monitoring session." : "."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Report includes</p>
          <ul className="space-y-1.5 text-sm text-foreground/80">
            <li className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
              Incidents + timestamps
            </li>
            <li className="flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-primary shrink-0" />
              Transport / media metrics snapshots
            </li>
            <li className="flex items-center gap-2">
              <StickyNote className="h-3.5 w-3.5 text-primary shrink-0" />
              Notes, markers, host changes
            </li>
          </ul>
        </div>

        {session && (
          <p className="text-xs text-muted-foreground truncate">{session.name}</p>
        )}

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={onClose} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button variant="outline" onClick={handleDownload} className="gap-1.5 border-border/40">
            <FileText className="h-3.5 w-3.5" />
            Download Report
          </Button>
          {isOwner && (
            <Button onClick={handleReconfigure} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Reconfigure and Start
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ExpiredSessionDialog;
