import { Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** When true, styles the badge for a non-owner viewer perspective. */
  asViewer?: boolean;
}

/**
 * Small chip indicating this session is being watched by multiple people
 * (i.e. it's actively shared beyond its owner).
 */
const SharedSessionBadge = ({ className, asViewer }: Props) => (
  <span
    title={
      asViewer
        ? "You joined this session via a shared link"
        : "This session is being watched by others"
    }
    className={cn(
      "inline-flex items-center gap-1 rounded px-1.5 py-[2px] border text-[9px] uppercase tracking-wider font-semibold shrink-0",
      asViewer
        ? "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/25"
        : "text-primary bg-primary/10 border-primary/25",
      className,
    )}
  >
    <Share2 className="h-2.5 w-2.5" />
    Shared
  </span>
);

export default SharedSessionBadge;
