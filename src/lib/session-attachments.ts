// Persistent-source attachments for a session (Phase 5).
//
// Reads only the viewer-safe columns of public.session_sources. Existing RLS
// ("Participants read session sources") lets the owner AND any authorized
// collaborator read them, which is what makes shared playback work without
// ever exposing the owner's ingest_sources row (SRT port, infrastructure id,
// ownership, library).

import { supabase } from "@/integrations/supabase/client";
import type { SessionAttachment, SrtLine } from "@/lib/session-store";

/** Attachment intent sent to save-session. Nothing authoritative here. */
export interface AttachmentIntent {
  slot: number;
  ingest_source_id: string;
  label?: string;
}

/** True when this slot is backed by a persistent MAKO source. */
export function isSourceBacked(line: SrtLine): boolean {
  return line.sourceKind === "mako" && !!line.ingestSourceId;
}

/**
 * The intended attachment set for a session's slots. The server derives the
 * label fallback and the playback path — we only name the source and slot.
 */
export function attachmentIntents(lines: SrtLine[]): AttachmentIntent[] {
  return lines
    .filter((l) => l.enabled && isSourceBacked(l))
    .map((l) => {
      const custom = (l.label ?? "").trim();
      const isDefaultLabel = /^(line|source)\s*\d+$/i.test(custom);
      return {
        slot: l.id,
        ingest_source_id: l.ingestSourceId as string,
        ...(custom && !isDefaultLabel ? { label: custom } : {}),
      };
    });
}

/** Active attachments (detached_at IS NULL) for a session. */
export async function loadSessionAttachments(
  sessionId: string,
): Promise<SessionAttachment[]> {
  const { data, error } = await supabase
    .from("session_sources")
    .select("slot, label, playback_path, ingest_source_id, attached_at")
    .eq("session_id", sessionId)
    .is("detached_at", null)
    .order("slot", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    slot: row.slot,
    label: row.label,
    playbackPath: row.playback_path,
    ingestSourceId: row.ingest_source_id,
    attachedAt: row.attached_at,
  }));
}
