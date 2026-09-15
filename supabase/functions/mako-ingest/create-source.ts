// Provision + persist flow for a MAKO Receive source.
//
// Runtime-agnostic on purpose: every side effect (upstream provision, upstream
// delete, database insert, logging) is injected, so this can be unit tested
// without Deno, network access, or touching real MAKO infrastructure.

export const SOURCE_ID_PATTERN = /^src_[a-f0-9]{6}$/;
export const MIN_SRT_PORT = 10020;
export const MAX_SRT_PORT = 10999;

/** Active MAKO Receive sources allowed per owner. Single source of truth. */
export const MAX_ACTIVE_SOURCES = 4;

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

export type ReserveResult =
  | { ok: true; id: string }
  | { ok: false; reason: "limit_reached" | "error" };

export type CreateSourceDeps = {
  /**
   * Atomically reserve a quota slot for this owner and return the id of the
   * `provisioning` registry row. Serialized per owner in the database, so two
   * concurrent creates cannot both pass the limit.
   */
  reserveSlot: (params: { ownerId: string; name: string; max: number }) => Promise<ReserveResult>;
  /** POST /sources on the private MAKO ingest API. */
  provision: (name: string) => Promise<ProvisionResult>;
  /** Fill the reserved row with the provisioned infrastructure identity. */
  finalizeRegistryRow: (id: string, patch: RegistryPatch) => Promise<boolean>;
  /** Delete the reserved row, releasing the quota slot. */
  releaseReservation: (id: string) => Promise<boolean>;
  /** DELETE /sources/:id on the private MAKO ingest API. */
  deleteUpstream: (sourceId: string) => Promise<boolean>;
  /** Sanitized operational logging. Never receives secrets or raw bodies. */
  logError: (message: string) => void;
};

export type RegistryPatch = {
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
 * Reserve a quota slot, provision infrastructure, validate the response, then
 * complete the reserved registry row. Any failure releases the reservation and
 * deletes infrastructure created by THIS request, so quota, registry and
 * infrastructure can never drift apart.
 */
export async function createSource(
  params: { ownerId: string; name: string; max?: number },
  deps: CreateSourceDeps,
): Promise<CreateSourceOutcome> {
  const max = params.max ?? MAX_ACTIVE_SOURCES;

  // Quota is reserved BEFORE any external infrastructure is touched.
  const reservation = await deps.reserveSlot({
    ownerId: params.ownerId,
    name: params.name,
    max,
  });
  if (reservation.ok !== true) {
    const reason = (reservation as { reason?: string }).reason;
    if (reason === "limit_reached") {
      return { status: 409, body: { error: "source_limit_reached", limit: max } };
    }
    return { status: 500, body: { error: "create_failed" } };
  }
  const reservationId = reservation.id;

  const provisioned = await deps.provision(params.name);
  if (!provisioned.ok) {
    await release(reservationId, deps, provisioned.error ?? "upstream_error");
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
    await release(reservationId, deps, "malformed upstream response");
    return { status: 502, body: { error: "create_failed" } };
  }

  const finalized = await deps.finalizeRegistryRow(reservationId, {
    infrastructure_source_id: source.source_id,
    srt_port: source.port,
    playback_path: source.output_path,
    lifecycle_status: "ready",
    connection_status: "unknown",
    connection_checked_at: null,
    last_error: null,
  });

  if (!finalized) {
    await compensate(source.source_id, deps, "registry finalization failed");
    await release(reservationId, deps, "registry finalization failed");
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
      ingest_source_id: reservationId,
    },
  };
}

async function release(reservationId: string, deps: CreateSourceDeps, reason: string) {
  let released = false;
  try {
    released = await deps.releaseReservation(reservationId);
  } catch {
    released = false;
  }
  if (!released) {
    deps.logError(
      `mako-ingest: reservation ${reservationId} could not be released (${reason}) — stale provisioning row holds a quota slot`,
    );
  }
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
