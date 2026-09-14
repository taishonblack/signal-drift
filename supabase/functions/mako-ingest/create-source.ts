// Provision + persist flow for a MAKO Receive source.
//
// Runtime-agnostic on purpose: every side effect (upstream provision, upstream
// delete, database insert, logging) is injected, so this can be unit tested
// without Deno, network access, or touching real MAKO infrastructure.

export const SOURCE_ID_PATTERN = /^src_[a-f0-9]{6}$/;
export const MIN_SRT_PORT = 10020;
export const MAX_SRT_PORT = 10999;

export type ProvisionedSource = {
  source_id: string;
  port: number;
  output_path: string;
  name: string | null;
  state: string | null;
};

export type ProvisionResult = {
  ok: boolean;
  raw?: Record<string, unknown>;
  error?: string;
  status?: number;
};

export type InsertResult = {
  ok: boolean;
  id?: string | null;
  duplicate?: boolean;
};

export type CreateSourceDeps = {
  /** POST /sources on the private MAKO ingest API. */
  provision: (name: string) => Promise<ProvisionResult>;
  /** Insert the registry row using a service-role database client. */
  insertRegistryRow: (row: RegistryRow) => Promise<InsertResult>;
  /** DELETE /sources/:id on the private MAKO ingest API. */
  deleteUpstream: (sourceId: string) => Promise<boolean>;
  /** Sanitized operational logging. Never receives secrets or raw bodies. */
  logError: (message: string) => void;
};

export type RegistryRow = {
  owner_id: string;
  name: string;
  connection_mode: "receive";
  infrastructure_source_id: string;
  srt_port: number;
  playback_path: string;
  lifecycle_status: "ready";
  connection_status: "unknown";
  connection_checked_at: null;
  last_error: null;
};

export type CreateSourceOutcome = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Validate the upstream provisioning response. Nothing from the ingest API is
 * trusted: identity, port range, and playback path must all be consistent.
 */
export function validateProvisionedSource(raw: unknown): ProvisionedSource | null {
  const container = (raw ?? {}) as Record<string, unknown>;
  const s = ((container.source ?? container) ?? {}) as Record<string, unknown>;

  const sourceId = typeof s.source_id === "string" ? s.source_id : "";
  if (!SOURCE_ID_PATTERN.test(sourceId)) return null;

  const port = typeof s.port === "number" ? s.port : Number(s.port);
  if (!Number.isInteger(port) || port < MIN_SRT_PORT || port > MAX_SRT_PORT) return null;

  const outputPath = typeof s.output_path === "string" ? s.output_path : "";
  if (outputPath !== `${sourceId}-opus`) return null;

  return {
    source_id: sourceId,
    port,
    output_path: outputPath,
    name: typeof s.name === "string" ? s.name : null,
    state: typeof s.state === "string" ? s.state : null,
  };
}

/**
 * Provision infrastructure, validate the response, then persist the registry
 * row. Infrastructure created by THIS request is deleted again if validation
 * or persistence fails, so the two sides can never drift apart.
 */
export async function createSource(
  params: { ownerId: string; name: string },
  deps: CreateSourceDeps,
): Promise<CreateSourceOutcome> {
  const provisioned = await deps.provision(params.name);
  if (!provisioned.ok) {
    return {
      status: provisioned.status ?? 502,
      body: { error: provisioned.error ?? "upstream_error" },
    };
  }

  const raw = provisioned.raw ?? {};
  const source = validateProvisionedSource(raw);
  if (!source) {
    // Upstream claims success but the response is unusable. Treat the whole
    // provision as failed; we cannot safely target cleanup without a valid id.
    const claimed = ((raw.source ?? raw) ?? {}) as Record<string, unknown>;
    const claimedId = typeof claimed.source_id === "string" ? claimed.source_id : "";
    if (SOURCE_ID_PATTERN.test(claimedId)) {
      await compensate(claimedId, deps, "malformed upstream response");
    } else {
      deps.logError(
        "mako-ingest: create rejected — upstream response malformed and no valid source id to reconcile",
      );
    }
    return { status: 502, body: { error: "create_failed" } };
  }

  const inserted = await deps.insertRegistryRow({
    owner_id: params.ownerId,
    name: params.name,
    connection_mode: "receive",
    infrastructure_source_id: source.source_id,
    srt_port: source.port,
    playback_path: source.output_path,
    lifecycle_status: "ready",
    connection_status: "unknown",
    connection_checked_at: null,
    last_error: null,
  });

  if (!inserted.ok) {
    await compensate(
      source.source_id,
      deps,
      inserted.duplicate ? "duplicate infrastructure_source_id" : "registry insert failed",
    );
    return { status: 500, body: { error: "create_failed" } };
  }

  return {
    status: 200,
    body: {
      source: {
        name: source.name ?? params.name,
        source_id: source.source_id,
        port: source.port,
        output_path: source.output_path,
        state: source.state,
      },
      ingest_source_id: inserted.id ?? null,
    },
  };
}

async function compensate(sourceId: string, deps: CreateSourceDeps, reason: string) {
  let deleted = false;
  try {
    deleted = await deps.deleteUpstream(sourceId);
  } catch {
    deleted = false;
  }
  if (!deleted) {
    deps.logError(
      `mako-ingest: compensating delete FAILED for ${sourceId} (${reason}) — orphaned infrastructure source requires operator reconciliation`,
    );
  } else {
    deps.logError(`mako-ingest: create rolled back, deleted ${sourceId} (${reason})`);
  }
}
