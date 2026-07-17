// TimelinePanel — the shared operational history for a session (Phase 1A).
// Replaces the free-text Notes panel with a structured, filterable feed.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, MoreHorizontal, Filter, X, ArrowUpDown, LayoutPanelLeft, PanelBottom, PanelRight, ExternalLink, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamInput } from "@/lib/mock-data";
import type { AddEntryInput } from "@/hooks/use-session-timeline";
import type { TimelineEntry, TimelineSeverity } from "@/lib/timeline-types";
import { SEVERITY_META } from "@/lib/timeline-types";

interface TimelinePanelProps {
  focusedInputId: string | null;
  focusedLabel: string;
  inputs: StreamInput[];
  entries: TimelineEntry[];
  ready: boolean;
  isMember: boolean;
  eventTimeZone: string;
  onAdd: (input: AddEntryInput) => Promise<TimelineEntry | null>;
  onDelete: (id: string) => Promise<void>;
  onFocusSource?: (inputId: string) => void;
  onCollapse?: () => void;
  currentUserId: string;
}

type SourceKey = string; // "all" | "audio" | "session" | input.id
type SeverityFilter = "all" | TimelineSeverity;
type SortOrder = "oldest" | "newest";

const SEVERITY_OPTIONS: { value: TimelineSeverity; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "information", label: "Information" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

const formatTime = (iso: string, tz: string) => {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
};

const formatFullDate = (iso: string, tz: string) => {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: tz,
      dateStyle: "long",
      timeStyle: "medium",
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
};

const TimelinePanel = ({
  focusedInputId,
  focusedLabel,
  inputs,
  entries,
  ready,
  isMember,
  eventTimeZone,
  onAdd,
  onDelete,
  onFocusSource,
  onCollapse,
  currentUserId,
}: TimelinePanelProps) => {
  const [draft, setDraft] = useState("");
  const [severity, setSeverity] = useState<TimelineSeverity>("note");
  const [sourceSel, setSourceSel] = useState<SourceKey>("focused");
  const [posting, setPosting] = useState(false);

  // Filters (viewer-personal, in-memory).
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sourceFilterId, setSourceFilterId] = useState<string | "all">("all");
  const [order, setOrder] = useState<SortOrder>("oldest");

  const resolveSource = (): { id: string | null; name: string | null } => {
    if (sourceSel === "focused") {
      return focusedInputId
        ? { id: focusedInputId, name: focusedLabel }
        : { id: null, name: "Session" };
    }
    if (sourceSel === "all") return { id: null, name: "All Sources" };
    if (sourceSel === "audio") return { id: "audio", name: "Audio" };
    if (sourceSel === "session") return { id: null, name: "Session" };
    const found = inputs.find((i) => i.id === sourceSel);
    return { id: found?.id ?? null, name: found?.label ?? null };
  };

  const submit = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    const { id, name } = resolveSource();
    await onAdd({
      message: draft,
      severity,
      sourceId: id,
      sourceName: name,
      entryType:
        severity === "warning"
          ? "warning"
          : severity === "critical"
            ? "critical"
            : severity === "information"
              ? "information"
              : "comment",
    });
    setDraft("");
    setPosting(false);
  };

  const filtered = useMemo(() => {
    let list = entries.filter((e) => e.parentId === null);
    if (severityFilter !== "all") {
      list = list.filter((e) => e.severity === severityFilter);
    }
    if (sourceFilterId !== "all") {
      list = list.filter((e) => e.sourceId === sourceFilterId);
    }
    const sorted = [...list].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    return order === "newest" ? sorted.reverse() : sorted;
  }, [entries, severityFilter, sourceFilterId, order]);

  const hasFilters = severityFilter !== "all" || sourceFilterId !== "all";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mako-glass rounded-lg flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Timeline
            </span>
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              {entries.length}
            </span>
            {!isMember && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
                Guest · not saved
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setOrder((o) => (o === "oldest" ? "newest" : "oldest"))}
              title={order === "oldest" ? "Oldest first" : "Newest first"}
              aria-label="Toggle sort order"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </Button>
            {onCollapse && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCollapse}
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                aria-label="Collapse timeline"
                title="Collapse timeline"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="px-4 py-3 border-b border-border/10 space-y-2">
          <div className="flex gap-2">
            <Select value={sourceSel} onValueChange={(v) => setSourceSel(v as SourceKey)}>
              <SelectTrigger className="h-8 w-[150px] bg-muted/20 border-border/20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="focused">Focused: {focusedLabel}</SelectItem>
                <SelectItem value="all">All Sources</SelectItem>
                {inputs.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.label}
                  </SelectItem>
                ))}
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="session">Session</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={severity}
              onValueChange={(v) => setSeverity(v as TimelineSeverity)}
            >
              <SelectTrigger className="h-8 w-[130px] bg-muted/20 border-border/20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            className="bg-muted/20 border-border/20 text-sm min-h-[60px] text-foreground placeholder:text-muted-foreground/40"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/60">
              ⌘/Ctrl + Enter to post
            </span>
            <Button
              size="sm"
              onClick={submit}
              disabled={!draft.trim() || posting}
              className="h-7"
            >
              Add Comment
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border/10">
          <Filter className="h-3 w-3 text-muted-foreground/60" />
          <FilterChip
            active={severityFilter === "all"}
            onClick={() => setSeverityFilter("all")}
          >
            All
          </FilterChip>
          {(["note", "information", "warning", "critical"] as TimelineSeverity[]).map(
            (s) => (
              <FilterChip
                key={s}
                active={severityFilter === s}
                onClick={() => setSeverityFilter(s)}
                tone={s}
              >
                {SEVERITY_META[s].label}
              </FilterChip>
            ),
          )}
          <div className="w-px h-3 bg-border/30 mx-1" />
          <FilterChip
            active={sourceFilterId === "all"}
            onClick={() => setSourceFilterId("all")}
          >
            All Sources
          </FilterChip>
          {inputs.map((i) => (
            <FilterChip
              key={i.id}
              active={sourceFilterId === i.id}
              onClick={() => setSourceFilterId(i.id)}
            >
              {i.label}
            </FilterChip>
          ))}
          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] text-muted-foreground hover:text-foreground gap-1 ml-auto"
              onClick={() => {
                setSeverityFilter("all");
                setSourceFilterId("all");
              }}
            >
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
          {!ready ? (
            <div className="text-xs text-muted-foreground/60 px-2 py-6 text-center">
              Loading timeline…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground/60 px-2 py-6 text-center">
              {entries.length === 0
                ? "No entries yet. Add the first comment above."
                : "No entries match the current filters."}
            </div>
          ) : (
            filtered.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                eventTimeZone={eventTimeZone}
                canDelete={e.authorId === currentUserId || e.id.startsWith("local-")}
                onDelete={() => onDelete(e.id)}
                onFocusSource={onFocusSource}
              />
            ))
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

const FilterChip = ({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: TimelineSeverity;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border transition-colors",
      active
        ? tone
          ? SEVERITY_META[tone].badge + " border-transparent"
          : "bg-primary/20 text-primary border-primary/40"
        : "bg-transparent text-muted-foreground/70 border-border/20 hover:text-foreground hover:border-border/50",
    )}
  >
    {children}
  </button>
);

const EntryCard = ({
  entry,
  eventTimeZone,
  canDelete,
  onDelete,
  onFocusSource,
}: {
  entry: TimelineEntry;
  eventTimeZone: string;
  canDelete: boolean;
  onDelete: () => void;
  onFocusSource?: (id: string) => void;
}) => {
  const meta = SEVERITY_META[entry.severity];
  return (
    <div
      className={cn(
        "rounded-md border-l-2 bg-muted/10 hover:bg-muted/15 transition-colors px-3 py-2",
        meta.accent,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", meta.dot)} />
          <span className="text-xs font-medium text-foreground truncate">
            {entry.authorName}
          </span>
          {entry.authorType === "quinn" && (
            <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-primary/20 text-primary">
              Quinn AI
            </span>
          )}
          {entry.authorType === "system" && (
            <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/40 text-muted-foreground">
              System
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-muted-foreground/70 font-mono">
                {formatTime(entry.createdAt, eventTimeZone)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {formatFullDate(entry.createdAt, eventTimeZone)}
            </TooltipContent>
          </Tooltip>
          {entry.editedAt && (
            <span className="text-[9px] text-muted-foreground/50 italic">edited</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={cn("text-[9px] uppercase px-1.5 py-0.5 rounded", meta.badge)}>
            {meta.label}
          </span>
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground/60 hover:text-foreground"
                  aria-label="Entry actions"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {entry.sourceName && (
        <button
          type="button"
          onClick={() => entry.sourceId && onFocusSource?.(entry.sourceId)}
          disabled={!entry.sourceId}
          className={cn(
            "text-[10px] text-muted-foreground/70 mt-1 truncate block max-w-full text-left",
            entry.sourceId && "hover:text-primary transition-colors",
          )}
        >
          {entry.sourceName}
        </button>
      )}
      <div className="text-sm text-foreground/90 mt-1 whitespace-pre-wrap break-words">
        {entry.message}
      </div>
    </div>
  );
};

export default TimelinePanel;
