import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { StreamInput } from "@/lib/mock-data";
import {
  emptySnapshot,
  freshness,
  snapshotForRoute,
  type MediaTelemetrySnapshot,
  type RouteIdentity,
} from "@/lib/telemetry/contract";
import {
  MEDIA_PROBE_RETRY_DELAYS_MS,
  MediaTelemetryBridgeProvider,
  type MediaProbeFetcher,
  type MediaProbeResult,
  type TelemetryProvider,
} from "@/lib/telemetry/provider";

/**
 * Default fetcher: the authenticated `media-telemetry` Edge Function, addressed
 * by canonical runtime route id. The browser never sees MAKO_API_TOKEN, never
 * learns the remote endpoint, and never sends a URL, host or path of its own.
 */
export const invokeMediaTelemetry: MediaProbeFetcher = async (
  runtimeRouteId,
): Promise<MediaProbeResult> => {
  const { data, error } = await supabase.functions.invoke("media-telemetry", {
    body: { runtime_route_id: runtimeRouteId },
  });
  if (error) return { ok: false, code: "upstream_error" };
  const body = data as
    | { ok?: boolean; telemetry?: unknown; error?: string; reason?: string | null }
    | null;
  if (body?.ok && body.telemetry) {
    return { ok: true, payload: body.telemetry as never };
  }
  const code = body?.error;
  return {
    ok: false,
    code:
      code === "unauthorized" || code === "not_found" || code === "telemetry_unavailable"
        ? code
        : "upstream_error",
    reason: body?.reason ?? null,
  };
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Read media telemetry for the caller-first routes attached to a session.
 *
 * Telemetry is keyed strictly by `session_runtime_routes.id`, so an ended or
 * replaced route can never show its values under a reused slot. Phase E.2B
 * fetches ONCE per ready runtime route (plus a bounded retry while MAKO's RTSP
 * publication is still coming up) and caches the result per route id. There is
 * no interval and no continuous polling. Transport and browser-receive values
 * remain not measured.
 */
export function useMediaTelemetry(
  sessionId: string,
  inputs: StreamInput[],
  provider: TelemetryProvider = defaultProvider,
) {
  const [snapshots, setSnapshots] = useState<MediaTelemetrySnapshot[]>([]);
  const cache = useRef(new Map<string, MediaTelemetrySnapshot>());

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
    const live = new Set(routes.map((r) => r.runtimeRouteId));

    // Identity-only snapshots first: correct provenance, no invented values.
    setSnapshots(routes.map((identity) => freshness(emptySnapshot(identity))));

    const apply = (snapshot: MediaTelemetrySnapshot) => {
      // A late response from an ended, replaced, detached or torn-down route is
      // discarded — never applied to whatever now occupies the slot.
      if (cancelled || !live.has(snapshot.runtimeRouteId)) return;
      setSnapshots((prev) =>
        prev.map((s) => (s.runtimeRouteId === snapshot.runtimeRouteId ? snapshot : s)),
      );
    };

    const build = async (
      identity: RouteIdentity,
    ): Promise<{ snapshot: MediaTelemetrySnapshot; observed: boolean; retryable: boolean }> => {
      const media = await provider.getMediaMetadata(identity);
      const transport = await provider.getTransportTelemetry(identity);
      const receiver = await provider.getReceiverTelemetry(identity);
      return {
        snapshot: freshness({
          ...emptySnapshot(identity),
          video: media.video,
          audioSource: media.audioSource,
          audioOutput: media.audioOutput,
          observedAt: media.observedAt ?? null,
          source: media.source ?? null,
          observationPoint: media.observationPoint ?? null,
          transport,
          receiver,
        }),
        observed: !media.failure,
        retryable: media.failure === "telemetry_unavailable",
      };
    };

    const loadRoute = async (identity: RouteIdentity) => {
      // A route without a resolved playback path is not ready to be probed.
      if (!identity.playbackPath) return;

      const cached = cache.current.get(identity.runtimeRouteId);
      if (cached) {
        apply(cached);
        return;
      }

      const delays = [0, ...MEDIA_PROBE_RETRY_DELAYS_MS];
      for (let attempt = 0; attempt < delays.length; attempt += 1) {
        if (delays[attempt] > 0) await wait(delays[attempt]);
        if (cancelled) return;

        const { snapshot, observed, retryable } = await build(identity);
        if (cancelled) return;

        if (observed) {
          cache.current.set(identity.runtimeRouteId, snapshot);
          apply(snapshot);
          return;
        }
        // Bounded: retry only a not-yet-published RTSP output, then stop.
        if (!retryable || attempt === delays.length - 1) {
          apply(snapshot);
          return;
        }
      }
    };

    void Promise.all(routes.map((identity) => loadRoute(identity)));

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

const defaultProvider: TelemetryProvider = new MediaTelemetryBridgeProvider(invokeMediaTelemetry);
