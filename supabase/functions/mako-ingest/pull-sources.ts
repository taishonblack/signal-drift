// MAKO Caller ("pull") routes.
//
// Permanent architecture rule: MAKO is ALWAYS the SRT Caller. The operator
// supplies the external SRT Listener's public host/IP and port, and MAKO
// initiates the connection to it. The friendly name is a label only — it never
// influences transport or any URL.
//
// Runtime-agnostic on purpose: every side effect (upstream HTTP, logging) is
// injected, so all of this is unit-testable without Deno, network access, or
// touching real infrastructure.
//
// Validation here is DEFENSE IN DEPTH. The infrastructure API is the
// authoritative security boundary for public-address validation — it is the
// machine that actually opens the SRT connection. No DNS resolution happens
// in this Edge Function.

export const SOURCE_ID_PATTERN = /^src_[a-f0-9]{6}$/;

export const MIN_PORT = 1;
export const MAX_PORT = 65535;

/** Human label constraints. Never used in a URL or transport decision. */
export const NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

const HOSTNAME_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

export type CallerSource = {
  source_id: string;
  host: string;
  port: number;
  output_path: string;
  name: string | null;
  service: string | null;
  state: string | null;
};

export type UpstreamResult = {
  ok: boolean;
  raw?: Record<string, unknown>;
  error?: string;
  status?: number;
};

export type PullSourceDeps = {
  /** POST /pull-sources with { name, host, port }. */
  createUpstream: (body: {
    name: string;
    host: string;
    port: number;
  }) => Promise<UpstreamResult>;
  /** GET /pull-sources/:source_id. */
  getUpstream: (sourceId: string) => Promise<UpstreamResult>;
  /** DELETE /pull-sources/:source_id. */
  deleteUpstream: (sourceId: string) => Promise<UpstreamResult>;
  /** Sanitized operational logging. Never receives secrets or raw bodies. */
  logError: (message: string) => void;
};

export type PullSourceOutcome = {
  status: number;
  body: Record<string, unknown>;
};

/** Trim + validate the friendly label. */
export function validateName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length < 1 || name.length > 64) return null;
  if (!NAME_PATTERN.test(name)) return null;
  return name;
}

/** Integer port in the full TCP/UDP range. */
export function validatePort(raw: unknown): number | null {
  const port = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) return null;
  return port;
}

function isIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** Obvious non-routable literals. The infrastructure API remains authoritative. */
export function isObviouslyPrivate(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }
  if (!isIpv4(h)) return false;
  const [a, b] = h.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/**
 * Syntactic host validation: a bare hostname or IP literal, with no scheme,
 * path, credentials, port, brackets or whitespace.
 */
export function isSyntacticallyValidHost(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const host = raw.trim();
  if (host.length < 1 || host.length > 253) return false;
  if (host !== raw) return false;
  if (/[\s/\\@?#"'<>%]/.test(host)) return false;
  if (host.includes("://")) return false;
  if (host.startsWith("[") || host.endsWith("]")) return false;

  // IPv6 literal (unbracketed, no port possible).
  if (host.includes(":")) return /^[0-9a-f:]+$/i.test(host) && !host.includes(":::");

  if (isIpv4(host)) return true;

  // Hostname: dot-separated labels, no trailing dot, not all-numeric TLD.
  const labels = host.split(".");
  if (labels.some((l) => !HOSTNAME_LABEL.test(l))) return false;
  if (labels.length > 1 && /^\d+$/.test(labels[labels.length - 1])) return false;
  return true;
}

/** Request-side host validation, with a reason for the client. */
export function validateHost(raw: unknown): { ok: true; host: string } | { ok: false; reason: string } {
  if (!isSyntacticallyValidHost(raw)) return { ok: false, reason: "invalid_host" };
  const host = (raw as string).trim();
  if (isObviouslyPrivate(host)) return { ok: false, reason: "host_not_public" };
  return { ok: true, host };
}

/**
 * Validate an upstream caller-route payload. Nothing from the infrastructure
 * API is trusted: identity, playback path, host and port must all be present
 * and consistent, or the whole call is treated as failed.
 */
export function validateCallerSource(raw: unknown): CallerSource | null {
  const container = (raw ?? {}) as Record<string, unknown>;
  const s = ((container.source ?? container) ?? {}) as Record<string, unknown>;

  const sourceId = typeof s.source_id === "string" ? s.source_id : "";
  if (!SOURCE_ID_PATTERN.test(sourceId)) return null;

  const outputPath = typeof s.output_path === "string" ? s.output_path : "";
  if (outputPath !== `${sourceId}-opus`) return null;

  if (!isSyntacticallyValidHost(s.host)) return null;
  const host = (s.host as string).trim();

  const port = validatePort(s.port);
  if (port === null) return null;

  return {
    source_id: sourceId,
    host,
    port,
    output_path: outputPath,
    name: typeof s.name === "string" ? s.name : null,
    service: typeof s.service === "string" ? s.service : null,
    state: typeof s.state === "string" ? s.state : null,
  };
}

function upstreamFailure(result: UpstreamResult): PullSourceOutcome {
  return {
    status: result.status ?? 502,
    body: { error: result.error ?? "upstream_error" },
  };
}

function ok(source: CallerSource): PullSourceOutcome {
  return { status: 200, body: { source } };
}

/**
 * Create a caller route: MAKO will dial the supplied external SRT Listener.
 * No database row is written in this phase.
 */
export async function createPullSource(
  params: { name: unknown; host: unknown; port: unknown },
  deps: PullSourceDeps,
): Promise<PullSourceOutcome> {
  const name = validateName(params.name);
  if (name === null) return { status: 400, body: { error: "invalid_name" } };

  const host = validateHost(params.host);
  if (host.ok !== true) return { status: 400, body: { error: host.reason } };

  const port = validatePort(params.port);
  if (port === null) return { status: 400, body: { error: "invalid_port" } };

  const upstream = await deps.createUpstream({ name, host: host.host, port });
  if (!upstream.ok) return upstreamFailure(upstream);

  const source = validateCallerSource(upstream.raw ?? {});
  if (!source) {
    deps.logError("mako-ingest: create_pull_source rejected — upstream response malformed");
    return { status: 502, body: { error: "invalid_upstream_response" } };
  }

  return ok(source);
}

/** Read one caller route's live state. */
export async function getPullSource(
  params: { source_id: unknown },
  deps: PullSourceDeps,
): Promise<PullSourceOutcome> {
  const sourceId = typeof params.source_id === "string" ? params.source_id : "";
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    return { status: 400, body: { error: "invalid_source_id" } };
  }

  const upstream = await deps.getUpstream(sourceId);
  if (!upstream.ok) return upstreamFailure(upstream);

  const source = validateCallerSource(upstream.raw ?? {});
  if (!source) {
    deps.logError("mako-ingest: get_pull_source rejected — upstream response malformed");
    return { status: 502, body: { error: "invalid_upstream_response" } };
  }
  if (source.source_id !== sourceId) {
    deps.logError("mako-ingest: get_pull_source rejected — upstream identity mismatch");
    return { status: 502, body: { error: "invalid_upstream_response" } };
  }

  return ok(source);
}

/** Delete one caller route. A 404 upstream is treated as already gone. */
export async function deletePullSource(
  params: { source_id: unknown },
  deps: PullSourceDeps,
): Promise<PullSourceOutcome> {
  const sourceId = typeof params.source_id === "string" ? params.source_id : "";
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    return { status: 400, body: { error: "invalid_source_id" } };
  }

  const upstream = await deps.deleteUpstream(sourceId);
  if (!upstream.ok) return upstreamFailure(upstream);

  return { status: 200, body: { deleted: true, source_id: sourceId } };
}
