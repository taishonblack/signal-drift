import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FocusState {
  focusedId: string;
  focusedBy: string;
}

/**
 * Manages shared Focus state for a session via Lovable Cloud realtime.
 * Falls back to local state if the session row doesn't exist yet.
 */
export function useSessionFocus(sessionId: string, defaultInputId: string) {
  const [focusedId, setFocusedId] = useState(defaultInputId);
  const [focusedBy, setFocusedBy] = useState("You");
  const [ready, setReady] = useState(false);

  // Load initial state
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("session_focus")
        .select("focused_input_id, focused_by")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (data) {
        setFocusedId(data.focused_input_id);
        setFocusedBy(data.focused_by);
      } else {
        // Seed row for this session
        await supabase.from("session_focus").insert({
          session_id: sessionId,
          focused_input_id: defaultInputId,
          focused_by: "You",
        });
      }
      setReady(true);
    };
    load();
  }, [sessionId, defaultInputId]);

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel(`focus-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "session_focus",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as { focused_input_id: string; focused_by: string };
          setFocusedId(row.focused_input_id);
          setFocusedBy(row.focused_by);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const setFocus = useCallback(
    async (inputId: string) => {
      // Optimistic local update
      setFocusedId(inputId);
      setFocusedBy("You");

      await supabase
        .from("session_focus")
        .update({
          focused_input_id: inputId,
          focused_by: "You",
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);
    },
    [sessionId]
  );

  return { focusedId, focusedBy, setFocus, ready };
}
