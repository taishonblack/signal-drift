// Phase E.5A — read-only access to the persistent incident ledger.
//
// Loads authorized incidents for a session, newest first. There is no demo
// fallback, no fallback to retired mock incident data, and no synthesized value: an empty ledger
// reports empty.

import { useCallback, useEffect, useState } from "react";
import { fetchSessionIncidents } from "@/lib/incidents/incidents-remote";
import type { IncidentRecord } from "@/lib/incidents/contract";

export interface SignalIncidentsState {
  incidents: IncidentRecord[];
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  reload: () => Promise<void>;
}

export function useSignalIncidents(
  sessionId: string | null | undefined,
): SignalIncidentsState {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) {
      setIncidents([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSessionIncidents(sessionId);
      setIncidents(rows);
    } catch (e) {
      setIncidents([]);
      setError(e instanceof Error ? e.message : "Could not load incidents.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    incidents,
    loading,
    error,
    isEmpty: !loading && !error && incidents.length === 0,
    reload: load,
  };
}
