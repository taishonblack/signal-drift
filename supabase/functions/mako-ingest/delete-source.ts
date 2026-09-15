// Registry-aware deletion flow for a MAKO Receive source.
//
// Runtime-agnostic on purpose: every side effect (registry read/write, session
// attachment count, upstream delete, logging) is injected, so this can be unit
// tested without Deno, network access, or touching real MAKO infrastructure.

export const SOURCE_ID_PATTERN = /^src_[a-f0-9]{6}$/;

export type RegistrySourceRow = {
  id: string;
  owner_id: string;
  infrastructure_source_id: string;
  lifecycle_status: string;
  connection_status: string;
};

export type RegistryPatch = {
  lifecycle_status?: string;
  connection_status?: string;
  connection_checked_at?: string | null;
  last_error?: string | null;
};

export type DeleteSourceDeps = {
  /** Look up the registry row by its infrastructure source id. */
  loadRegistryRow: (sourceId: string) => Promise<RegistrySourceRow | null>;
  /** Count session_sources rows for this source where detached_at IS NULL. */
  countActiveAttachments: (ingestSourceId: string) => Promise<number>;
  /** Update the registry row using a service-role database client. */
  updateRegistryRow: (id: string, patch: RegistryPatch) => Promise<boolean>;
  /** DELETE /sources/:id on the private MAKO ingest API. */
  deleteUpstream: (infrastructureSourceId: string) => Promise<boolean>;
  /** Sanitized operational logging. Never receives secrets or raw bodies. */
  logError: (message: string) => void;
  /** Injectable clock so tests can assert the checked-at timestamp. */
  now?: () => string;
};

export type DeleteSourceOutcome = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Delete a registered source. The registry row is authoritative: the browser
 * supplied id is only used to locate it, and the upstream DELETE target always
 * comes from the stored infrastructure_source_id.
 */
export async function deleteSource(
  params: { sourceId: string; userId: string; isAdmin: boolean },
  deps: DeleteSourceDeps,
): Promise<DeleteSourceOutcome> {
  if (!SOURCE_ID_PATTERN.test(params.sourceId)) {
    return { status: 400, body: { error: "invalid_source_id" } };
  }

  const row = await deps.loadRegistryRow(params.sourceId);
  if (!row) {
    // Pre-registry (legacy) infrastructure sources land here. Never delete
    // infrastructure we have no product record for.
    return { status: 409, body: { error: "not_registered" } };
  }

  if (!params.isAdmin && row.owner_id !== params.userId) {
    return { status: 403, body: { error: "forbidden" } };
  }

  if (row.lifecycle_status === "deleted") {
    return {
      status: 200,
      body: {
        source_id: row.infrastructure_source_id,
        deleted: true,
        already_deleted: true,
        ingest_source_id: row.id,
      },
    };
  }

  if (row.lifecycle_status === "deleting") {
    return { status: 409, body: { error: "delete_in_progress" } };
  }

  const attached = await deps.countActiveAttachments(row.id);
  if (attached > 0) {
    return { status: 409, body: { error: "source_in_use" } };
  }

  const marked = await deps.updateRegistryRow(row.id, { lifecycle_status: "deleting" });
  if (!marked) {
    deps.logError(
      `mako-ingest: delete aborted — could not mark ${row.infrastructure_source_id} as deleting`,
    );
    return { status: 500, body: { error: "delete_failed" } };
  }

  let upstreamOk = false;
  try {
    // Authoritative target: the stored infrastructure id, never browser input.
    upstreamOk = await deps.deleteUpstream(row.infrastructure_source_id);
  } catch {
    upstreamOk = false;
  }

  if (!upstreamOk) {
    await deps.updateRegistryRow(row.id, {
      lifecycle_status: "error",
      last_error: "Infrastructure deletion failed. The source was not removed.",
    });
    deps.logError(
      `mako-ingest: delete FAILED upstream for ${row.infrastructure_source_id} — registry row preserved for reconciliation`,
    );
    return { status: 502, body: { error: "delete_failed" } };
  }

  const nowIso = (deps.now ?? (() => new Date().toISOString()))();
  const finalized = await deps.updateRegistryRow(row.id, {
    lifecycle_status: "deleted",
    connection_status: "offline",
    connection_checked_at: nowIso,
    last_error: null,
  });
  if (!finalized) {
    deps.logError(
      `mako-ingest: ${row.infrastructure_source_id} deleted upstream but registry finalization failed — requires operator reconciliation`,
    );
  }

  return {
    status: 200,
    body: {
      source_id: row.infrastructure_source_id,
      deleted: true,
      ingest_source_id: row.id,
    },
  };
}
