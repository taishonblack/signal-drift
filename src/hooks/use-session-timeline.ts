// Session Timeline hook — persistence + realtime for signed-in users;
// ephemeral in-memory list for guests/anon.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/lib/identity";
import type {
  TimelineAuthorType,
  TimelineEntry,
  TimelineEntryType,
  TimelineSeverity,
} from "@/lib/timeline-types";

interface DbRow {
  id: string;
  session_id: string;
  author_id: string | null;
  author_name: string;
  author_type: string;
  source_id: string | null;
  source_name: string | null;
  entry_type: string;
  message: string;
  severity: string;
  parent_id: string | null;
  status: string;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  quinn_confidence: number | null;
  metadata: unknown;
  edited_at: string | null;
  created_at: string;
}

function rowToEntry(r: DbRow): TimelineEntry {
  return {
    id: r.id,
    sessionId: r.session_id,
    authorId: r.author_id,
    authorName: r.author_name,
    authorType: r.author_type as TimelineAuthorType,
    sourceId: r.source_id,
    sourceName: r.source_name,
    entryType: r.entry_type as TimelineEntryType,
    message: r.message,
    severity: r.severity as TimelineSeverity,
    parentId: r.parent_id,
    status: r.status as TimelineEntry["status"],
    resolvedBy: r.resolved_by,
    resolvedByName: r.resolved_by_name,
    resolvedAt: r.resolved_at,
    quinnConfidence: r.quinn_confidence,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    editedAt: r.edited_at,
    createdAt: r.created_at,
  };
}

export interface AddEntryInput {
  message: string;
  severity: TimelineSeverity;
  sourceId?: string | null;
  sourceName?: string | null;
  entryType?: TimelineEntryType;
  parentId?: string | null;
}

export function useSessionTimeline(sessionId: string | undefined) {
  const identity = useIdentity();
  const isMember = identity.kind === "member";
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [ready, setReady] = useState(false);
  const entriesRef = useRef<TimelineEntry[]>([]);
  entriesRef.current = entries;

  // Initial load
  useEffect(() => {
    let cancelled = false;
    if (!sessionId) return;
    if (!isMember) {
      // Guest: no persistence.
      setEntries([]);
      setReady(true);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("session_timeline_entries")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn("Timeline load failed", error);
        setEntries([]);
      } else {
        setEntries((data ?? []).map((r) => rowToEntry(r as DbRow)));
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, isMember]);

  // Realtime
  useEffect(() => {
    if (!sessionId || !isMember) return;
    const channel = supabase
      .channel(`timeline-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_timeline_entries",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setEntries((prev) => {
            if (payload.eventType === "INSERT") {
              const row = rowToEntry(payload.new as DbRow);
              if (prev.some((e) => e.id === row.id)) return prev;
              return [...prev, row].sort((a, b) =>
                a.createdAt.localeCompare(b.createdAt),
              );
            }
            if (payload.eventType === "UPDATE") {
              const row = rowToEntry(payload.new as DbRow);
              return prev.map((e) => (e.id === row.id ? row : e));
            }
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string })?.id;
              return oldId ? prev.filter((e) => e.id !== oldId) : prev;
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, isMember]);

  const addEntry = useCallback(
    async (input: AddEntryInput): Promise<TimelineEntry | null> => {
      if (!sessionId) return null;
      const message = input.message.trim();
      if (!message) return null;

      if (!isMember) {
        // Guest: local-only entry.
        const local: TimelineEntry = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sessionId,
          authorId: null,
          authorName: identity.name,
          authorType: "operator",
          sourceId: input.sourceId ?? null,
          sourceName: input.sourceName ?? null,
          entryType: input.entryType ?? "comment",
          message,
          severity: input.severity,
          parentId: input.parentId ?? null,
          status:
            input.severity === "warning" || input.severity === "critical"
              ? "open"
              : "informational",
          resolvedBy: null,
          resolvedByName: null,
          resolvedAt: null,
          quinnConfidence: null,
          metadata: { guest: true },
          editedAt: null,
          createdAt: new Date().toISOString(),
        };
        setEntries((prev) => [...prev, local]);
        return local;
      }

      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return null;

      const status =
        input.severity === "warning" || input.severity === "critical"
          ? "open"
          : "informational";

      const { data, error } = await supabase
        .from("session_timeline_entries")
        .insert({
          session_id: sessionId,
          author_id: user.id,
          author_name: identity.name,
          author_type: "operator",
          source_id: input.sourceId ?? null,
          source_name: input.sourceName ?? null,
          entry_type: input.entryType ?? "comment",
          message,
          severity: input.severity,
          parent_id: input.parentId ?? null,
          status,
        })
        .select()
        .single();

      if (error || !data) {
        console.warn("Timeline insert failed", error);
        return null;
      }
      const entry = rowToEntry(data as DbRow);
      // Optimistic append; realtime will de-dupe.
      setEntries((prev) =>
        prev.some((e) => e.id === entry.id) ? prev : [...prev, entry],
      );
      return entry;
    },
    [sessionId, isMember, identity.name],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (!isMember || id.startsWith("local-")) return;
      await supabase.from("session_timeline_entries").delete().eq("id", id);
    },
    [isMember],
  );

  const count = entries.length;

  return useMemo(
    () => ({ entries, ready, addEntry, deleteEntry, count, isMember }),
    [entries, ready, addEntry, deleteEntry, count, isMember],
  );
}
