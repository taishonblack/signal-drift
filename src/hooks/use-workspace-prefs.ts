import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_WORKSPACE_PREFS,
  loadWorkspacePrefs,
  saveWorkspacePrefs,
  normalizePrefs,
  type WorkspacePrefs,
} from "@/lib/workspace-prefs";
import { supabase } from "@/integrations/supabase/client";

/**
 * Personal per-viewer workspace prefs for the Session Room.
 * Debounces writes so dragging a divider doesn't hammer the network.
 */
export function useWorkspacePrefs() {
  const [prefs, setPrefs] = useState<WorkspacePrefs>(DEFAULT_WORKSPACE_PREFS);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<WorkspacePrefs | null>(null);
  const timerRef = useRef<number | null>(null);

  // Track the current auth user id (null for guests).
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setUserId(sess?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load once we know the identity.
  useEffect(() => {
    let cancelled = false;
    loadWorkspacePrefs(userId).then((p) => {
      if (cancelled) return;
      setPrefs(p);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const p = pendingRef.current;
    pendingRef.current = null;
    if (p) void saveWorkspacePrefs(userId, p);
  }, [userId]);

  const update = useCallback(
    (patch: Partial<WorkspacePrefs>) => {
      setPrefs((prev) => {
        const next = normalizePrefs({ ...prev, ...patch });
        pendingRef.current = next;
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          const p = pendingRef.current;
          pendingRef.current = null;
          timerRef.current = null;
          if (p) void saveWorkspacePrefs(userId, p);
        }, 350);
        return next;
      });
    },
    [userId],
  );

  // Flush on unload to avoid losing the last drag.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("beforeunload", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  return { prefs, update, ready, flush };
}
