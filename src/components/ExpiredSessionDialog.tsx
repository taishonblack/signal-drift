import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, StickyNote, RefreshCw, X, Eye, User, Users } from "lucide-react";
import type { Session } from "@/lib/mock-data";
import { generateSessionReportPDF } from "@/lib/session-report-pdf";

interface Props {
  session: Session | null;
  /** If true, show "Reconfigure and Start" — reserved for the session owner. */
  isOwner?: boolean;
  onClose: () => void;
}

/**
 * Shared modal for ended sessions.
 * Used from Sessions page, RecentSessionsPanel, and anywhere an ended
 * session card is clicked. Do NOT duplicate this — call this component.
 */
const ExpiredSessionDialog = ({ session, isOwner, onClose }: Props) => {
  const navigate = useNavigate();

  const handleDownload = () => {
    if (session) generateSessionReportPDF(session);
    onClose();
  };

  const handleView = () => {
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
      <AlertDialogContent
        className="mako-glass-solid border-border/30 w-[calc(100vw-2rem)] sm:w-full sm:max-w-[600px] p-0 gap-0 max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <AlertDialogHeader className="px-6 pt-6 pb-4 space-y-3 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 rounded px-2 py-0.5">
              Ended
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded px-2 py-0.5 ${
                isOwner
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/30 text-muted-foreground"
              }`}
            >
              {isOwner ? <User className="h-2.5 w-2.5" /> : <Users className="h-2.5 w-2.5" />}
              {isOwner ? "Owned" : "Shared"}
            </span>
          </div>
          <AlertDialogTitle className="text-foreground text-base sm:text-lg leading-tight break-words">
            {session?.name ?? "Ended session"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed">
            This session is no longer live and MAKO does not record streams.
            You can view or download a technical report with incidents, metrics,
            notes, and markers
            {isOwner
              ? ", or reconfigure the same sources into a fresh monitoring session."
              : "."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Body */}
        <div className="px-6 pb-4 overflow-y-auto flex-1 min-h-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Report includes
          </p>
          <ul className="space-y-2 text-sm text-foreground/80">
            <li className="flex items-center gap-2.5">
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
              Incidents + timestamps
            </li>
            <li className="flex items-center gap-2.5">
              <BarChart3 className="h-3.5 w-3.5 text-primary shrink-0" />
              Transport / media metrics snapshots
            </li>
            <li className="flex items-center gap-2.5">
              <StickyNote className="h-3.5 w-3.5 text-primary shrink-0" />
              Notes, markers, host changes
            </li>
          </ul>
        </div>

        {/* Footer — desktop: Cancel · Download · Reconfigure (right-aligned)
                     mobile: Reconfigure · Download · Cancel (stacked)     */}
        <div className="px-6 py-4 border-t border-border/20 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 shrink-0">
          <Button
            variant="ghost"
            onClick={onClose}
            className="gap-1.5 w-full sm:w-auto"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleView}
            className="gap-1.5 border-border/40 w-full sm:w-auto"
          >
            <Eye className="h-3.5 w-3.5" /> View Report
          </Button>
          <Button
            variant="outline"
            onClick={handleDownload}
            className="gap-1.5 border-border/40 w-full sm:w-auto"
          >
            <FileText className="h-3.5 w-3.5" /> Download
          </Button>
          {isOwner && (
            <Button
              onClick={handleReconfigure}
              className="gap-1.5 w-full sm:w-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconfigure and Start
            </Button>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ExpiredSessionDialog;
