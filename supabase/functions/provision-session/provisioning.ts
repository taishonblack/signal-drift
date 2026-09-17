// Phase C — caller-first session provisioning (pure orchestration).
//
// Permanent architecture rule: MAKO is ALWAYS the SRT Caller. The operator
// supplies a friendly name plus the external SRT Listener's host and port; MAKO
// provisions a caller to it and attaches the resulting playback identity to the
// session.
//
// Every side effect is injected, so the whole workflow is unit-testable without
// Deno, network access or real infrastructure.
//
// Invariants enforced here:
//   - session_runtime_routes.id IS the caller idempotency key (Phase A.2).
//   - A lost create response is recovered by key, never by allocating a new id.
//   - A changed endpoint is a typed conflict; nothing is torn down for it.
//   - A tombstoned key can never recreate infrastructure.
//   - Callers created during a failed attempt are compensated; if teardown
//     cannot be confirmed, the runtime row is retained with its identity.

export const SOURCE_ID_PATTERN = /^src_[a-f0-9]{6}$/;

export type SlotRequest = {
  slot: number;
  name: string;
  host: string;
  port: number;
};

export type LibraryAttachment = {
  slot: number;
  ingest_source_id: string;
  label?: string;
};

export type ReserveResult =
  | {
      status: "reserved" | "resume" | "ready";
      route_id: string;
      infrastructure_source_id?: string | null;
      playback_path?: string | null;
    }
  | {
      status: "endpoint_conflict" | "route_tearing_down" | "endpoint_in_use";
      route_id?: string;
    };

export type CallerSourceLike = {
  source_id: string;
  output_path: string;
  idempotency_key: string;
  state?: string | null;
};

export type CallerResult = {
  ok: boolean;
  /** Upstream/Edge status, used to map 409 / 410 precisely. */
  status?: number;
  error?: string;
  source?: CallerSourceLike;
};

export type ProvisionDeps = {
  reserveRoute: (slot: SlotRequest) => Promise<ReserveResult>;
  createCaller: (args: {
    name: string;
    host: string;
    port: number;
    idempotency_key: string;
  }) => Promise<CallerResult>;
  lookupCaller: (idempotencyKey: string) => Promise<CallerResult>;
  deleteCaller: (sourceId: string) => Promise<{ ok: boolean; error?: string }>;
  finalizeRoute: (
    routeId: string,
    infrastructureSourceId: string,
    playbackPath: string,
  ) => Promise<boolean>;
  failRoute: (routeId: string, error: string) => Promise<void>;
  recordTeardownFailure: (routeId: string, error: string) => Promise<void>;
  archiveRoute: (routeId: string, finalStatus: "torn_down" | "error") => Promise<boolean>;
  /** Trusted transactional save: session row + complete attachment set. */
  saveSession: (attachments: SavedAttachment[]) => Promise<{ ok: boolean; error?: string }>;
  logError: (message: string) => void;
};

export type SavedAttachment =
  | { slot: number; runtime_route_id: string; label?: string }
  | { slot: number; ingest_source_id: string; label?: string };

export type ProvisionOutcome = {
  status: number;
  body: Record<string, unknown>;
};

type ProvisionedSlot = {
  slot: number;
  routeId: string;
  label: string;
  playbackPath: string;
  /** True when THIS attempt created the upstream caller. */
  createdHere: boolean;
  infrastructureSourceId: string;
};

const CONFLICT_STATUS = 409;
const GONE_STATUS = 410;

function validCallerSource(
  source: CallerSourceLike | undefined,
  expectedKey: string,
): source is CallerSourceLike {
  if (!source) return false;
  if (!SOURCE_ID_PATTERN.test(source.source_id ?? "")) return false;
  if (source.output_path !== `${source.source_id}-opus`) return false;
  return source.idempotency_key === expectedKey;
}

/**
 * Provision every caller-backed slot for a session, then persist the session
 * and its complete attachment set in one trusted transaction.
 *
 * Slots are provisioned sequentially in slot order so compensation stays
 * deterministic and reasoning about partial failure is simple.
 */
export async function provisionSession(
  params: {
    slots: SlotRequest[];
    libraryAttachments?: LibraryAttachment[];
  },
  deps: ProvisionDeps,
): Promise<ProvisionOutcome> {
  const provisioned: ProvisionedSlot[] = [];
  /** Reserved rows that never reached `ready` during this attempt. */
  const reservedOnly: string[] = [];

  const fail = async (
    status: number,
    error: string,
    extra: Record<string, unknown> = {},
  ): Promise<ProvisionOutcome> => {
    const compensation = await compensate(provisioned, reservedOnly, error, deps);
    return { status, body: { error, ...extra, compensation } };
  };

  for (const slot of params.slots) {
    const reserved = await deps.reserveRoute(slot);

    if (reserved.status === "endpoint_conflict") {
      return await fail(409, "endpoint_conflict", { slot: slot.slot });
    }
    if (reserved.status === "route_tearing_down") {
      return await fail(409, "route_tearing_down", { slot: slot.slot });
    }

    const routeId = reserved.route_id;
    if (!routeId) {
      return await fail(500, "reservation_failed", { slot: slot.slot });
    }
    // Reservation may report an already-known infrastructure identity for this
    // route (a previous attempt that got as far as upstream).
    const reservedInfra =
      "infrastructure_source_id" in reserved ? (reserved.infrastructure_source_id ?? null) : null;

    // Already ready for this exact endpoint — reuse, never create again.
    if (reserved.status === "ready" && reserved.playback_path) {
      provisioned.push({
        slot: slot.slot,
        routeId,
        label: slot.name,
        playbackPath: reserved.playback_path,
        createdHere: false,
        infrastructureSourceId: reservedInfra ?? "",
      });
      continue;
    }

    const priorInfra = reservedInfra;
    const created = await deps.createCaller({
      name: slot.name,
      host: slot.host,
      port: slot.port,
      idempotency_key: routeId,
    });

    if (created.ok && validCallerSource(created.source, routeId)) {
      const source = created.source as CallerSourceLike;
      const ok = await deps.finalizeRoute(routeId, source.source_id, source.output_path);
      if (!ok) {
        deps.logError(`provision-session: finalize failed for slot ${slot.slot}`);
        provisioned.push({
          slot: slot.slot,
          routeId,
          label: slot.name,
          playbackPath: source.output_path,
          createdHere: priorInfra === null,
          infrastructureSourceId: source.source_id,
        });
        return await fail(500, "route_persist_failed", { slot: slot.slot });
      }
      provisioned.push({
        slot: slot.slot,
        routeId,
        label: slot.name,
        playbackPath: source.output_path,
        createdHere: priorInfra === null,
        infrastructureSourceId: source.source_id,
      });
      continue;
    }

    if (created.status === CONFLICT_STATUS) {
      reservedOnly.push(routeId);
      return await fail(409, "endpoint_conflict", { slot: slot.slot });
    }
    if (created.status === GONE_STATUS) {
      reservedOnly.push(routeId);
      return await fail(409, "route_tombstoned", { slot: slot.slot });
    }

    // Unknown / lost-response state: recover by idempotency key before
    // concluding anything. The key is the runtime route id, so recovery can
    // never allocate replacement infrastructure.
    const recovered = await deps.lookupCaller(routeId);
    if (recovered.ok && validCallerSource(recovered.source, routeId)) {
      const source = recovered.source as CallerSourceLike;
      if (source.state === "tombstoned") {
        reservedOnly.push(routeId);
        return await fail(409, "route_tombstoned", { slot: slot.slot });
      }
      const ok = await deps.finalizeRoute(routeId, source.source_id, source.output_path);
      provisioned.push({
        slot: slot.slot,
        routeId,
        label: slot.name,
        playbackPath: source.output_path,
        createdHere: priorInfra === null,
        infrastructureSourceId: source.source_id,
      });
      if (!ok) {
        deps.logError(`provision-session: finalize failed after recovery, slot ${slot.slot}`);
        return await fail(500, "route_persist_failed", { slot: slot.slot });
      }
      continue;
    }

    deps.logError(
      `provision-session: slot ${slot.slot} provisioning failed (${created.error ?? "unknown"})`,
    );
    reservedOnly.push(routeId);
    return await fail(502, "provisioning_failed", { slot: slot.slot });
  }

  // Trusted transactional save. Only intent is sent: label fallback and the
  // playback path are derived inside the database from the runtime route.
  const attachments: SavedAttachment[] = [
    ...provisioned.map((p) => ({
      slot: p.slot,
      runtime_route_id: p.routeId,
      ...(p.label ? { label: p.label } : {}),
    })),
    ...(params.libraryAttachments ?? []).map((a) => ({
      slot: a.slot,
      ingest_source_id: a.ingest_source_id,
      ...(a.label ? { label: a.label } : {}),
    })),
  ];

  const saved = await deps.saveSession(attachments);
  if (!saved.ok) {
    return await fail(500, saved.error || "save_failed");
  }

  return {
    status: 200,
    body: {
      ok: true,
      routes: provisioned.map((p) => ({
        slot: p.slot,
        route_id: p.routeId,
        playback_path: p.playbackPath,
      })),
    },
  };
}

/**
 * Undo the infrastructure this attempt created. Nothing is hard-deleted from
 * the database unless teardown is CONFIRMED — an unconfirmed teardown keeps the
 * runtime row (with identity, attempts and error) for later reconciliation.
 */
async function compensate(
  provisioned: ProvisionedSlot[],
  reservedOnly: string[],
  reason: string,
  deps: ProvisionDeps,
): Promise<{ torn_down: number; retained: number }> {
  let tornDown = 0;
  let retained = 0;

  for (const routeId of reservedOnly) {
    await deps.failRoute(routeId, reason);
    retained += 1;
  }

  // Newest first: teardown in reverse provisioning order.
  for (const entry of [...provisioned].reverse()) {
    if (!entry.createdHere) continue; // pre-existing infrastructure is left alone
    const deleted = await deps.deleteCaller(entry.infrastructureSourceId);
    if (deleted.ok) {
      const archived = await deps.archiveRoute(entry.routeId, "torn_down");
      if (archived) {
        tornDown += 1;
        continue;
      }
      await deps.recordTeardownFailure(entry.routeId, "archive_failed");
      retained += 1;
      continue;
    }
    deps.logError(`provision-session: teardown unconfirmed for route ${entry.routeId}`);
    await deps.recordTeardownFailure(entry.routeId, deleted.error || "teardown_failed");
    retained += 1;
  }

  return { torn_down: tornDown, retained };
}
