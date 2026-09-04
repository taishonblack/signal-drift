// Single source of truth for how a MAKO source slot maps to a MediaMTX
// stream path and its WebRTC (WHEP) playback URL.
//
// IMPORTANT: the SRT address a user types on the Create page describes the
// *contribution / ingest* destination (encoder -> MediaMTX). It is never
// used to build the browser playback URL. Playback always uses the
// configured MediaMTX WHEP base plus the slot mapping:
//
//   Source 1 -> cam1, Source 2 -> cam2, Source 3 -> cam3, Source 4 -> cam4
//
//   Encoder --SRT--> host:8890 (streamid publish:cam1)
//           --MediaMTX--> path cam1
//           --WHEP--> <MEDIAMTX_WHEP_BASE>/cam1/whep --> browser

import type { SessionRecord, SrtLine } from "@/lib/session-store";
import type { StreamInput } from "@/lib/mock-data";

/** Stream name (MediaMTX path) for a 1-based source slot. */
export function streamNameForSlot(slot: number): string {
  return `cam${slot}`;
}

/** Stream ID the encoder must publish with, for a 1-based source slot. */
export function publishIdForSlot(slot: number): string {
  return `publish:${streamNameForSlot(slot)}`;
}

/**
 * WHEP base URL.
 *
 * Development: omit VITE_MEDIAMTX_WHEP_BASE and requests go through the
 * existing Vite `/mediamtx` proxy.
 * Production: VITE_MEDIAMTX_WHEP_BASE must be set to an HTTPS endpoint
 * (e.g. https://stream.makosrt.com). We never fall back to a raw http:// IP,
 * which browsers block as mixed content on an HTTPS site.
 */
export interface WhepBaseResult {
  ok: boolean;
  /** Present when ok. */
  base?: string;
  /** Present when ok: where the base came from. */
  source?: "env" | "dev-proxy";
  /** Present when not ok. */
  reason?: "missing-production-whep-base";
}

export const MISSING_WHEP_BASE_MESSAGE =
  "Production MediaMTX WHEP endpoint is not configured.";

/** Typed resolution of the WHEP base. Never silently uses the SPA origin. */
export function resolveWhepBase(): WhepBaseResult {
  const configured = (import.meta.env.VITE_MEDIAMTX_WHEP_BASE as string | undefined)?.trim();
  if (configured) return { ok: true, base: configured.replace(/\/+$/, ""), source: "env" };
  if (import.meta.env.DEV) return { ok: true, base: "/mediamtx", source: "dev-proxy" };
  return { ok: false, reason: "missing-production-whep-base" };
}

/** Diagnostics-friendly string form of the resolved base. */
export function whepBase(): string {
  const resolved = resolveWhepBase();
  return resolved.ok ? (resolved.base as string) : `(unset — ${resolved.reason})`;
}

export interface WhepEndpointResult {
  ok: boolean;
  url?: string;
  reason?: "missing-production-whep-base";
}

/** Full WHEP endpoint for a stream name, or a typed configuration error. */
export function whepEndpointForStream(streamName: string): WhepEndpointResult {
  const resolved = resolveWhepBase();
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  return { ok: true, url: `${resolved.base}/${streamName}/whep` };
}

/** Full WHEP endpoint for a stream name (diagnostics only — may be unusable). */
export function whepUrlForStream(streamName: string): string {
  const endpoint = whepEndpointForStream(streamName);
  return endpoint.ok ? (endpoint.url as string) : MISSING_WHEP_BASE_MESSAGE;
}


/** Full WHEP endpoint for a 1-based source slot. */
export function whepUrlForSlot(slot: number): string {
  return whepUrlForStream(streamNameForSlot(slot));
}


export type ProbeResult = "available" | "no_publisher" | "misconfigured" | "failed";

export interface ProbeDiagnostics {
  result: ProbeResult;
  /** Human-readable, credential-free explanation. */
  detail: string;
  url: string;
  status?: number;
  body?: string;
}

/** Resolve a possibly-relative WHEP Location against a possibly-relative base. */
export function resolveWhepResource(location: string, base: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return new URL(location, new URL(base, origin)).toString();
}

export type WhepOutcome =
  | "answer"
  | "no_publisher"
  | "codec_unsupported"
  | "misconfigured"
  | "not_configured"
  | "http_error"
  | "network_error";

export interface WhepNegotiation {
  outcome: WhepOutcome;
  detail: string;
  /** Requested URL, or the configuration message when unresolved. */
  url: string;
  status?: number;
  contentType?: string;
  /** First 300 chars of a non-SDP / error body. */
  body?: string;
  /** Valid SDP answer — only set when outcome === "answer". */
  answerSdp?: string;
  /** Resolved WHEP resource URL from the Location header, when provided. */
  resourceUrl?: string;
}

const isHtmlBody = (body: string) => /^\s*<(!doctype html|html)\b/i.test(body);

/**
 * Shared WHEP negotiation used by both Test Connection and LiveCamera so the
 * two paths cannot drift. Creates the offer on the supplied peer connection,
 * POSTs it, and validates that what came back is really an SDP answer.
 *
 * The response body is authoritative: Content-Type is logged as an advisory
 * signal only. This function never calls setRemoteDescription — the caller
 * decides what to do with a valid answer.
 */
export async function negotiateWhep(
  streamName: string,
  pc: RTCPeerConnection,
  label = "whep",
): Promise<WhepNegotiation> {
  const endpoint = whepEndpointForStream(streamName);
  const log = (d: Record<string, unknown>) => {
    if (import.meta.env.DEV) console.info(`[${label}]`, { streamName, ...d });
  };

  if (!endpoint.ok) {
    log({ step: "config", reason: endpoint.reason });
    return {
      outcome: "not_configured",
      detail: MISSING_WHEP_BASE_MESSAGE,
      url: MISSING_WHEP_BASE_MESSAGE,
    };
  }

  const url = endpoint.url as string;

  try {
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const offersH264 = /H264\/90000/i.test(offer.sdp ?? "");
    log({ step: "offer", url, offersH264, localSdpSet: true });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: offer.sdp ?? "",
    });

    const contentType = res.headers.get("Content-Type") ?? undefined;
    const raw = await res.text().catch(() => "");
    const body = raw.slice(0, 300);
    log({ step: "response", url, status: res.status, contentType, bodyHead: raw.slice(0, 100) });

    if (res.status === 404) {
      return {
        outcome: "no_publisher",
        detail: `No publisher on ${streamName} (path not found).`,
        url,
        status: 404,
        contentType,
        body,
      };
    }

    if (!res.ok) {
      // MediaMTX answers 400 "codecs not supported by client" when a
      // publisher exists but this browser cannot decode it.
      if (res.status === 400 && body.includes("codecs not supported")) {
        return {
          outcome: "codec_unsupported",
          detail: `Publisher present on ${streamName}, but codec negotiation failed (this browser advertised no matching decoder${offersH264 ? "" : "; no H.264 in offer"}).`,
          url,
          status: 400,
          contentType,
          body,
        };
      }
      if (isHtmlBody(raw)) {
        return {
          outcome: "misconfigured",
          detail: `WHEP endpoint misconfigured — received HTML instead of SDP (${url}).`,
          url,
          status: res.status,
          contentType,
          body,
        };
      }
      return {
        outcome: "http_error",
        detail: `WHEP rejected: HTTP ${res.status} — ${body || res.statusText}`,
        url,
        status: res.status,
        contentType,
        body,
      };
    }

    // 2xx: the body decides. HTML means we hit the SPA, not MediaMTX.
    if (isHtmlBody(raw)) {
      return {
        outcome: "misconfigured",
        detail: `WHEP endpoint misconfigured — received HTML instead of SDP (${url}).`,
        url,
        status: res.status,
        contentType,
        body,
      };
    }

    if (!/^\s*v=/.test(raw)) {
      return {
        outcome: "misconfigured",
        detail: `WHEP endpoint misconfigured — response is not SDP (did not start with "v=").`,
        url,
        status: res.status,
        contentType,
        body,
      };
    }

    const location = res.headers.get("Location");
    const resourceUrl = location ? resolveWhepResource(location, url) : undefined;
    log({ step: "answer", location, resourceUrl });

    return {
      outcome: "answer",
      detail: `Signal available on ${streamName}.`,
      url,
      status: res.status,
      contentType,
      answerSdp: raw,
      resourceUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log({ step: "error", url, message });
    return {
      outcome: "network_error",
      detail: `MediaMTX unreachable or request error: ${message}`,
      url,
    };
  }
}

/**
 * Lightweight availability check for a MediaMTX path.
 *
 * Uses the same negotiation as LiveCamera, confirms a real SDP answer came
 * back, and then immediately tears everything down: the WHEP resource is
 * DELETEd and the RTCPeerConnection closed, so the test never leaves an idle
 * viewer attached to MediaMTX.
 */
export async function probeStream(streamName: string): Promise<ProbeDiagnostics> {
  const pc = new RTCPeerConnection();
  let resourceUrl: string | null = null;

  try {
    const n = await negotiateWhep(streamName, pc, "probeStream");
    resourceUrl = n.resourceUrl ?? null;

    let result: ProbeResult = "failed";
    if (n.outcome === "answer" || n.outcome === "codec_unsupported") result = "available";
    else if (n.outcome === "no_publisher") result = "no_publisher";
    else if (n.outcome === "misconfigured" || n.outcome === "not_configured")
      result = "misconfigured";

    return { result, detail: n.detail, url: n.url, status: n.status, body: n.body };
  } finally {
    if (resourceUrl) {
      // Best-effort teardown of the WHEP session on MediaMTX.
      void fetch(resourceUrl, { method: "DELETE" }).catch(() => undefined);
    }
    try {
      pc.close();
    } catch {
      /* noop */
    }
  }
}



/** True when a line has both a host and a port. */
function lineHasEndpoint(line: SrtLine, parse: (v: string) => { host: string; port: string }) {
  const { host, port } = parse(line.srtAddress ?? "");
  return !!host && !!port;
}

const emptyMetrics = {
  bitrate: 0,
  packetLoss: 0,
  rtt: 0,
  codec: "—",
  resolution: "—",
  fps: 0,
  audioChannels: 0,
  audioSampleRate: 0,
  lufs: 0,
};

/**
 * Build the real pane list for a session record. Only enabled sources that
 * have a valid address+port are rendered; every other slot is omitted.
 */
export function inputsFromRecord(
  record: SessionRecord,
  parseSrtInput: (v: string) => { host: string; port: string },
): StreamInput[] {
  return (record.lines ?? [])
    .filter((line) => line.enabled && lineHasEndpoint(line, parseSrtInput))
    .map((line) => {
      const slot = line.id;
      const { host, port } = parseSrtInput(line.srtAddress ?? "");
      const friendly = (line.label ?? "").trim();
      const isDefaultLabel = /^(line|source)\s*\d+$/i.test(friendly);
      return {
        id: `line-${slot}`,
        label: friendly && !isDefaultLabel ? `Source ${slot} — ${friendly}` : `Source ${slot}`,
        enabled: true,
        srtAddress: `srt://${host}:${port}`,
        passphrase: line.passphrase || undefined,
        status: "connecting" as const,
        metrics: { ...emptyMetrics },
        streamName: streamNameForSlot(slot),
        slot,
      } satisfies StreamInput;
    });
}
