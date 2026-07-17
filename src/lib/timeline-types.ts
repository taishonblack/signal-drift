// Shared types for the Session Timeline (Phase 1A).

export type TimelineAuthorType = "operator" | "quinn" | "system";

export type TimelineEntryType =
  | "comment"
  | "warning"
  | "critical"
  | "information"
  | "marker"
  | "configuration_change"
  | "session_event";

export type TimelineSeverity = "note" | "information" | "warning" | "critical";

export type TimelineStatus = "open" | "resolved" | "informational";

export interface TimelineEntry {
  id: string;
  sessionId: string;
  authorId: string | null;
  authorName: string;
  authorType: TimelineAuthorType;
  sourceId: string | null;
  sourceName: string | null;
  entryType: TimelineEntryType;
  message: string;
  severity: TimelineSeverity;
  parentId: string | null;
  status: TimelineStatus;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  quinnConfidence: number | null;
  metadata: Record<string, unknown>;
  editedAt: string | null;
  createdAt: string;
}

export const SEVERITY_META: Record<
  TimelineSeverity,
  { label: string; badge: string; accent: string; dot: string }
> = {
  note: {
    label: "Note",
    badge: "bg-muted/40 text-muted-foreground",
    accent: "border-l-muted-foreground/40",
    dot: "bg-muted-foreground/60",
  },
  information: {
    label: "Info",
    badge: "bg-primary/15 text-primary",
    accent: "border-l-primary/60",
    dot: "bg-primary/70",
  },
  warning: {
    label: "Warning",
    badge: "bg-warning/20 text-warning",
    accent: "border-l-warning/70",
    dot: "bg-warning/80",
  },
  critical: {
    label: "Critical",
    badge: "bg-destructive/20 text-destructive",
    accent: "border-l-destructive/80",
    dot: "bg-destructive",
  },
};
