import { useEffect, useMemo, useState } from "react";
import type { StreamInput } from "@/lib/mock-data";
import {
  emptySnapshot,
  freshness,
  snapshotForRoute,
  type MediaTelemetrySnapshot,
} from "@/lib/telemetry/contract";
import { NullTelemetryProvider, type TelemetryProvider } from "@/lib/telemetry/provider";

/**
 * Read media telemetry for the caller-first routes attached to a session.
 *
 * Telemetry is keyed strictly by `session_runtime_routes.id`, so an ended or
 * replaced route can never show its values under a reused slot. Phase E.2 ships
 * with the null provider: no server surface exposes captured FFmpeg metadata
 * yet, so every field resolves as unavailable / not measured rather than being
 * guessed. Later phases swap the provider without touching the UI.
 */
export function useMediaTelemetry(
  sessionId: string,
  inputs: StreamInput[],
  provider: TelemetryProvider = defaultProvider,
) {
  const [snapshots, setSnapshots] = useState<MediaTelemetrySnapshot[]>([]);

  const routes = useMemo(
    () =>
      inputs
        .filter((i) => !!i.runtimeRouteId)
        .map((i) => ({
          runtimeRouteId: i.runtimeRouteId as string,
          sessionId,
          slot: i.slot ?? 0,
          playbackPath: i.streamName ?? null,
        })),
    [inputs, sessionId],
  );

  const routeKey = routes.map((r) => r.runtimeRouteId).join("|");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const next = await Promise.all(
        routes.map(async (identity) => {
          const media = await provider.getMediaMetadata(identity);
          const transport = await provider.getTransportTelemetry(identity);
          const receiver = await provider.getReceiverTelemetry(identity);
          return freshness({
            ...emptySnapshot(identity),
            ...media,
            transport,
            receiver,
          });
        }),
      );
      if (!cancelled) setSnapshots(next);
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, sessionId, provider]);

  return {
    snapshots,
    forRoute: (runtimeRouteId: string | null | undefined) =>
      snapshotForRoute(snapshots, runtimeRouteId),
  };
}

const defaultProvider = new NullTelemetryProvider();
