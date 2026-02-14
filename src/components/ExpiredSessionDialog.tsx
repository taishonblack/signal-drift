import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { FileText, BarChart3, StickyNote } from "lucide-react";
import type { Session } from "@/lib/mock-data";
import { generateSessionReportPDF } from "@/lib/session-report-pdf";

interface Props {
  session: Session | null;
  onClose: () => void;
}

const ExpiredSessionDialog = ({ session, onClose }: Props) => {
  const handleDownload = () => {
    if (session) generateSessionReportPDF(session);
    onClose();
  };

  return (
    <AlertDialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="mako-glass-solid border-border/30 max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Ended session</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground leading-relaxed">
            This session is no longer live and MAKO does not record streams.
            You can download a technical report with incidents, metrics, notes, and markers.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Includes</p>
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
          <p className="text-xs text-muted-foreground truncate">
            {session.name}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className="border-border/40">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDownload} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Download Report (PDF)
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ExpiredSessionDialog;
