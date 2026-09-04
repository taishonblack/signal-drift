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
export function whepBase(): string {
  const configured = (import.meta.env.VITE_MEDIAMTX_WHEP_BASE as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "/mediamtx";
}

/** Full WHEP endpoint for a stream name. */
export function whepUrlForStream(streamName: string): string {
  return `${whepBase()}/${streamName}/whep`;
}

/** Full WHEP endpoint for a 1-based source slot. */
export function whepUrlForSlot(slot: number): string {
  return whepUrlForStream(streamNameForSlot(slot));
}

export type ProbeResult = "available" | "no_publisher" | "failed";

/**
 * Lightweight availability check for a MediaMTX path.
 *
 * Establishes a temporary WHEP peer connection, confirms whether playable
 * media exists, and then immediately tears everything down: the WHEP
 * resource is DELETEd and the RTCPeerConnection closed, so the test never
 * leaves an idle viewer attached to MediaMTX.
 */
export async function probeStream(streamName: string): Promise<ProbeResult> {
  let pc: RTCPeerConnection | null = null;
  let resourceUrl: string | null = null;
  try {
    pc = new RTCPeerConnection();
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const res = await fetch(whepUrlForStream(streamName), {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: offer.sdp ?? "",
    });

    if (res.status === 404) return "no_publisher";
    if (!res.ok) return "failed";

    const location = res.headers.get("Location");
    if (location) {
      resourceUrl = new URL(location, whepUrlForStream(streamName)).toString();
    }
    // We only need to know a publisher exists; no need to complete playback.
    return "available";
  } catch {
    return "failed";
  } finally {
    if (resourceUrl) {
      // Best-effort teardown of the WHEP session on MediaMTX.
      void fetch(resourceUrl, { method: "DELETE" }).catch(() => undefined);
    }
    try {
      pc?.close();
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
