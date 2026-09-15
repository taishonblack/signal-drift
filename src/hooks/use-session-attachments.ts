import { useCallback, useEffect, useState } from "react";
import { loadSessionAttachments } from "@/lib/session-attachments";
import type { SessionAttachment, SessionRecord } from "@/lib/session-store";

/**
 * Active persistent-source attachments for a session, kept outside the session
 * record so the local polling refresh can't clobber them.
 *
 * `loaded` stays false until the query settles: a slot backed by a persistent
 * source must render as connecting in that window rather than resolving to the
 * legacy camN path. Guests (no session) simply never load and keep legacy
 * behaviour.
 */
export function useSessionAttachments(sessionId?: string) {
  const [attachments, setAttachments] = useState<SessionAttachment[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!sessionId) {
      setAttachments([]);
      setLoaded(true);
      return;
    }
    try {
      setAttachments(await loadSessionAttachments(sessionId));
    } catch {
      // Not authorized / offline: leave the legacy path to decide.
      setAttachments([]);
    } finally {
      setLoaded(true);
    }
  }, [sessionId]);

  useEffect(() => {
    setLoaded(false);
    void reload();
  }, [reload]);

  /** Merge into a record purely for playback resolution. */
  const withAttachments = useCallback(
    <T extends SessionRecord | undefined>(record: T): T =>
      (record ? { ...record, attachments, attachmentsLoaded: loaded } : record) as T,
    [attachments, loaded],
  );

  return { attachments, loaded, reload, withAttachments };
}
