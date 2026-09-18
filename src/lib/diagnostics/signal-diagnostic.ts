/**
 * Phase F.1 — shared MAKO diagnostic vocabulary.
 *
 * Every diagnostic separates three things and never blurs them:
 *   confirmedFacts — what MAKO actually observed
 *   possibleCauses — explicitly unproven possibilities
 *   nextChecks     — what an engineer should verify next
 *
 * Hard rules for this phase:
 *   - MAKO cannot observe DNS, routing, refusal, timeout, SRT handshake state,
 *     firewall state or listener reachability, so no builder may claim them.
 *   - A created runtime route is NOT an SRT connection.
 *   - Reservation availability is NOT reachability.
 *   - No severity, no scores, no estimates.
 */

import { validateAddress, validatePort } from "./endpoint-validation";

export type DiagnosticCategory =
  | "configuration_invalid"
  | "endpoint_in_use"
  | "endpoint_available"
  | "provisioning_failed"
  | "no_media_publication"
  | "playback_endpoint_misconfigured"
  | "unknown";

export type DiagnosticProvenance =
  | "mako_configuration"
  | "mako_reservation"
  | "mako_provisioning"
  | "whep_playback";

export interface SignalDiagnostic {
  category: DiagnosticCategory;
  provenance: DiagnosticProvenance;
  /** Short headline for the card. */
  title: string;
  confirmedFacts: string[];
  possibleCauses: string[];
  nextChecks: string[];
  /** ISO timestamp of the observation. */
  observedAt: string;
  endpoint?: string | null;
  sourceLabel?: string | null;
  /** Always states what MAKO has not tested. */
  limitation: string;
}

/** The single honest statement about what F.1 does not test. */
export const NO_HANDSHAKE_LIMITATION =
  "MAKO has not performed an SRT handshake diagnostic. Network reachability has not been tested.";

/** Claims MAKO cannot prove in this phase. Used by guard tests. */
export const FORBIDDEN_CLAIM_PATTERNS: RegExp[] = [
  /firewall (is |was )?(blocked|blocking)/i,
  /blocked by (a )?firewall/i,
  /handshake (failed|succeeded|established)/i,
  /srt connected/i,
  /listener (is )?(reachable|unreachable)/i,
  /connection (refused|timed out)/i,
  /network unreachable/i,
  /dns (failed|failure)/i,
];

const REMOTE_MEDIA_CAUSES = [
  "remote SRT listener is not running",
  "incorrect public IP or port",
  "network/NAT/firewall path",
  "encoder is not producing media",
];

const REMOTE_MEDIA_CHECKS = [
  "confirm the remote device is in SRT Listener mode",
  "confirm the public IP and port with the remote engineer",
  "confirm UDP port forwarding/firewall configuration",
  "confirm the encoder is actively producing the feed",
];

export const formatEndpoint = (host?: string | null, port?: string | number | null): string | null =>
  host && port ? `${host}:${port}` : null;

/** Reservation state as reported by the server-authoritative check. */
export type ReservationState = "available" | "in_use" | "not_checked";

export interface ConfigurationInput {
  host: string;
  port: string;
  reservation: ReservationState;
  sourceLabel?: string | null;
  observedAt?: string;
}

/**
 * Configuration diagnostic — the result of "Check Configuration".
 *
 * Reports only: address syntax, port syntax and MAKO reservation state.
 */
export function buildConfigurationDiagnostic(input: ConfigurationInput): SignalDiagnostic {
  const address = validateAddress(input.host);
  const port = validatePort(input.port);
  const observedAt = input.observedAt ?? new Date().toISOString();
  const endpoint = formatEndpoint(input.host, input.port);
  const base = {
    provenance: "mako_configuration" as DiagnosticProvenance,
    observedAt,
    endpoint,
    sourceLabel: input.sourceLabel ?? null,
    limitation: NO_HANDSHAKE_LIMITATION,
  };

  if (!address.valid || !port.valid) {
    const facts: string[] = [];
    facts.push(address.valid ? address.message : address.message);
    facts.push(port.valid ? port.message : port.message);
    return {
      ...base,
      category: "configuration_invalid",
      title: "Configuration invalid",
      confirmedFacts: facts,
      possibleCauses: [
        "the address or port was mistyped",
        ...(address.kind === "ipv6_unsupported" ? ["an IPv6 address was entered"] : []),
      ],
      nextChecks: [
        "correct the address and port on this source",
        "confirm the endpoint with the remote engineer",
      ],
    };
  }

  if (input.reservation === "in_use") {
    return {
      ...base,
      provenance: "mako_reservation",
      category: "endpoint_in_use",
      title: "Endpoint in use by another MAKO session",
      confirmedFacts: [
        address.message,
        port.message,
        "Another MAKO runtime route currently reserves this host and port.",
      ],
      possibleCauses: [
        "the same endpoint is monitored in another live MAKO session",
        "a previous session's connection has not finished releasing",
      ],
      nextChecks: [
        "end the other MAKO session using this endpoint",
        "wait a moment and re-check the reservation",
      ],
    };
  }

  if (input.reservation === "not_checked") {
    return {
      ...base,
      category: "unknown",
      title: "Reservation not checked",
      confirmedFacts: [
        address.message,
        port.message,
        "MAKO has no reservation result for this endpoint yet.",
      ],
      possibleCauses: ["the reservation check has not completed"],
      nextChecks: ["re-run Check Configuration in a moment"],
    };
  }

  return {
    ...base,
    provenance: "mako_reservation",
    category: "endpoint_available",
    title: "Configuration valid",
    confirmedFacts: [
      address.message,
      port.message,
      "No other MAKO runtime route currently reserves this host and port.",
    ],
    possibleCauses: [],
    nextChecks: ["start monitoring — MAKO will attempt to connect to this listener"],
  };
}

/** Provisioning failure — a MAKO-side setup failure, never the remote's fault. */
export function buildProvisioningFailureDiagnostic(args: {
  endpoint?: string | null;
  sourceLabel?: string | null;
  observedAt?: string;
  detail?: string | null;
}): SignalDiagnostic {
  return {
    category: "provisioning_failed",
    provenance: "mako_provisioning",
    title: "MAKO connection setup failed",
    confirmedFacts: [
      "MAKO could not create the caller for this endpoint.",
      ...(args.detail ? [args.detail] : []),
    ],
    possibleCauses: [
      "MAKO's monitoring infrastructure did not accept the request",
      "a temporary problem inside MAKO's connection setup",
    ],
    nextChecks: [
      "retry once",
      "if the problem continues, this requires MAKO infrastructure investigation",
    ],
    observedAt: args.observedAt ?? new Date().toISOString(),
    endpoint: args.endpoint ?? null,
    sourceLabel: args.sourceLabel ?? null,
    limitation: NO_HANDSHAKE_LIMITATION,
  };
}

/** Playback observation states F.1 reads from the existing WHEP behaviour. */
export type PlaybackObservation =
  | "healthy"
  | "no_publisher"
  | "misconfigured"
  | "route_missing";

export interface PlaybackDiagnosticInput {
  observation: PlaybackObservation;
  /** True when MAKO created and attached a runtime route for this source. */
  routeCreated: boolean;
  endpoint?: string | null;
  sourceLabel?: string | null;
  observedAt?: string;
}

/**
 * Session Room diagnostic for one source.
 *
 * Returns null when there is nothing useful to report, so a healthy source
 * never carries a troubleshooting panel.
 */
export function buildPlaybackDiagnostic(
  input: PlaybackDiagnosticInput,
): SignalDiagnostic | null {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const base = {
    observedAt,
    endpoint: input.endpoint ?? null,
    sourceLabel: input.sourceLabel ?? null,
    limitation: NO_HANDSHAKE_LIMITATION,
  };

  if (input.observation === "healthy") return null;

  if (input.observation === "misconfigured") {
    return {
      ...base,
      category: "playback_endpoint_misconfigured",
      provenance: "whep_playback",
      title: "Playback endpoint misconfigured",
      confirmedFacts: ["MAKO's playback endpoint did not return a valid media response."],
      possibleCauses: ["MAKO playback configuration or proxy problem"],
      nextChecks: ["report this to MAKO — it is not a remote source problem"],
    };
  }

  if (input.observation === "route_missing" || !input.routeCreated) {
    return {
      ...base,
      category: "provisioning_failed",
      provenance: "mako_provisioning",
      title: "No runtime route for this source",
      confirmedFacts: ["MAKO has no runtime route for this source."],
      possibleCauses: [
        "connection setup did not complete for this source",
        "the route was released",
      ],
      nextChecks: ["open Configure Source and start this source again"],
    };
  }

  return {
    ...base,
    category: "no_media_publication",
    provenance: "whep_playback",
    title: "Connection issue",
    confirmedFacts: [
      "MAKO created a runtime route for this source.",
      "No media publication has been detected for this route.",
    ],
    possibleCauses: [...REMOTE_MEDIA_CAUSES],
    nextChecks: [...REMOTE_MEDIA_CHECKS],
  };
}
