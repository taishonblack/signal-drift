-- =========================================================
-- Phase B: session-scoped caller route persistence foundation
-- =========================================================

-- 1) Live runtime routes: a row here means infrastructure MAY still exist.
CREATE TABLE public.session_runtime_routes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 4),
  name text NOT NULL,
  remote_host text NOT NULL,
  remote_port integer NOT NULL CHECK (remote_port BETWEEN 1 AND 65535),
  infrastructure_source_id text,
  playback_path text,
  lifecycle_status text NOT NULL DEFAULT 'provisioning'
    CHECK (lifecycle_status IN ('provisioning','ready','tearing_down','error')),
  connection_status text NOT NULL DEFAULT 'unknown',
  connection_checked_at timestamptz,
  last_error text,
  teardown_requested_at timestamptz,
  teardown_completed_at timestamptz,
  teardown_attempts integer NOT NULL DEFAULT 0,
  teardown_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.session_runtime_routes TO authenticated;
GRANT ALL ON public.session_runtime_routes TO service_role;

ALTER TABLE public.session_runtime_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own runtime routes"
  ON public.session_runtime_routes FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE UNIQUE INDEX session_runtime_routes_session_slot_key
  ON public.session_runtime_routes (session_id, slot);
CREATE UNIQUE INDEX session_runtime_routes_infra_key
  ON public.session_runtime_routes (infrastructure_source_id)
  WHERE infrastructure_source_id IS NOT NULL;
CREATE UNIQUE INDEX session_runtime_routes_playback_key
  ON public.session_runtime_routes (playback_path)
  WHERE playback_path IS NOT NULL;
CREATE INDEX session_runtime_routes_owner_idx
  ON public.session_runtime_routes (owner_id);
CREATE INDEX session_runtime_routes_session_idx
  ON public.session_runtime_routes (session_id);
CREATE INDEX session_runtime_routes_reconcile_idx
  ON public.session_runtime_routes (teardown_requested_at)
  WHERE teardown_requested_at IS NOT NULL AND teardown_completed_at IS NULL;

CREATE TRIGGER session_runtime_routes_updated_at
  BEFORE UPDATE ON public.session_runtime_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_runtime_route_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lifecycle_status IN ('ready','tearing_down') THEN
    IF NEW.infrastructure_source_id IS NULL OR NEW.playback_path IS NULL THEN
      RAISE EXCEPTION 'a % runtime route requires infrastructure_source_id and playback_path', NEW.lifecycle_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER session_runtime_routes_enforce_invariants
  BEFORE INSERT OR UPDATE ON public.session_runtime_routes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_runtime_route_invariants();

-- 2) Append-only history: infrastructure is definitively gone.
--    No FK to sessions, so history outlives session deletion.
CREATE TABLE public.session_runtime_route_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  session_id text NOT NULL,
  slot smallint NOT NULL,
  name text NOT NULL,
  remote_host text,
  remote_port integer,
  infrastructure_source_id text,
  playback_path text,
  final_lifecycle_status text NOT NULL,
  connection_status text,
  teardown_requested_at timestamptz,
  teardown_completed_at timestamptz,
  teardown_attempts integer NOT NULL DEFAULT 0,
  teardown_error text,
  route_created_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.session_runtime_route_history TO authenticated;
GRANT ALL ON public.session_runtime_route_history TO service_role;

ALTER TABLE public.session_runtime_route_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own runtime route history"
  ON public.session_runtime_route_history FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE INDEX session_runtime_route_history_owner_idx
  ON public.session_runtime_route_history (owner_id);
CREATE INDEX session_runtime_route_history_session_idx
  ON public.session_runtime_route_history (session_id);

-- 3) session_sources: dual reference, exactly one of the two.
ALTER TABLE public.session_sources
  ALTER COLUMN ingest_source_id DROP NOT NULL;

ALTER TABLE public.session_sources
  ADD COLUMN runtime_route_id uuid
    REFERENCES public.session_runtime_routes(id) ON DELETE RESTRICT;

ALTER TABLE public.session_sources
  ADD CONSTRAINT session_sources_single_reference
    CHECK (num_nonnulls(ingest_source_id, runtime_route_id) = 1);

CREATE UNIQUE INDEX session_sources_active_runtime_route_key
  ON public.session_sources (session_id, runtime_route_id)
  WHERE detached_at IS NULL AND runtime_route_id IS NOT NULL;

-- 4) Route-aware save RPC.
CREATE OR REPLACE FUNCTION public.save_session_with_sources(_owner uuid, _session jsonb, _attachments jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id text := _session->>'id';
  v_status text := _session->>'status';
  v_atts jsonb := COALESCE(_attachments, '[]'::jsonb);
  v_existing_owner uuid;
  v_att jsonb;
  v_slot int;
  v_source uuid;
  v_route uuid;
  v_seen_slots int[] := '{}';
  v_seen_refs text[] := '{}';
  v_ref text;
  v_found boolean;
  v_path text;
  v_attached int := 0;
BEGIN
  IF _owner IS NULL THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF v_id IS NULL OR v_id = '' THEN RAISE EXCEPTION 'session_id_required'; END IF;
  IF jsonb_typeof(v_atts) <> 'array' THEN RAISE EXCEPTION 'invalid_attachments'; END IF;

  SELECT owner_id INTO v_existing_owner FROM public.sessions WHERE id = v_id FOR UPDATE;
  IF v_existing_owner IS NOT NULL AND v_existing_owner <> _owner THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 1) Validate every intent BEFORE writing attachments.
  FOR v_att IN SELECT value FROM jsonb_array_elements(v_atts) LOOP
    IF jsonb_typeof(v_att) <> 'object' THEN RAISE EXCEPTION 'invalid_attachment'; END IF;

    BEGIN
      v_slot   := (v_att->>'slot')::int;
      v_source := NULLIF(v_att->>'ingest_source_id', '')::uuid;
      v_route  := NULLIF(v_att->>'runtime_route_id', '')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_attachment';
    END;

    IF v_slot IS NULL OR v_slot < 1 OR v_slot > 4 THEN RAISE EXCEPTION 'invalid_slot'; END IF;
    IF (v_source IS NULL) = (v_route IS NULL) THEN
      RAISE EXCEPTION 'invalid_attachment_reference';
    END IF;
    IF v_slot = ANY(v_seen_slots) THEN RAISE EXCEPTION 'duplicate_slot'; END IF;
    v_seen_slots := v_seen_slots || v_slot;

    v_ref := COALESCE(v_source::text, v_route::text);
    IF v_ref = ANY(v_seen_refs) THEN RAISE EXCEPTION 'duplicate_source'; END IF;
    v_seen_refs := v_seen_refs || v_ref;

    IF v_source IS NOT NULL THEN
      SELECT true, playback_path INTO v_found, v_path
      FROM public.ingest_sources
      WHERE id = v_source
        AND owner_id = _owner
        AND lifecycle_status <> 'deleted';

      IF NOT COALESCE(v_found, false) THEN RAISE EXCEPTION 'source_not_found'; END IF;
      IF v_path IS NULL OR v_path = '' THEN RAISE EXCEPTION 'source_not_ready'; END IF;
    ELSE
      -- Runtime route: must belong to this owner AND this session, and be ready.
      SELECT true, playback_path INTO v_found, v_path
      FROM public.session_runtime_routes
      WHERE id = v_route
        AND owner_id = _owner
        AND session_id = v_id
        AND lifecycle_status = 'ready';

      IF NOT COALESCE(v_found, false) THEN RAISE EXCEPTION 'route_not_found'; END IF;
      IF v_path IS NULL OR v_path = '' THEN RAISE EXCEPTION 'route_not_ready'; END IF;
    END IF;

    v_found := false;
    v_path := NULL;
  END LOOP;

  -- 2) Session row. Owner always comes from the verified identity.
  INSERT INTO public.sessions (id, owner_id, name, status, pin_hash, payload)
  VALUES (
    v_id,
    _owner,
    COALESCE(_session->>'name', 'Session'),
    COALESCE(v_status, 'active'),
    NULLIF(_session->>'pin_hash', ''),
    COALESCE(_session->'payload', '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    name     = EXCLUDED.name,
    status   = EXCLUDED.status,
    pin_hash = EXCLUDED.pin_hash,
    payload  = EXCLUDED.payload;

  -- 3) Detach active attachments that are no longer intended (history kept).
  UPDATE public.session_sources ss
  SET detached_at = now()
  WHERE ss.session_id = v_id
    AND ss.detached_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_atts) a
      WHERE (a.value->>'slot')::int = ss.slot
        AND NULLIF(a.value->>'ingest_source_id','')::uuid IS NOT DISTINCT FROM ss.ingest_source_id
        AND NULLIF(a.value->>'runtime_route_id','')::uuid  IS NOT DISTINCT FROM ss.runtime_route_id
    );

  -- 4a) Attach library-source intents. Label/playback path derived server-side.
  WITH intent AS (
    SELECT
      (x.value->>'slot')::int AS slot,
      NULLIF(x.value->>'ingest_source_id','')::uuid AS src,
      NULLIF(btrim(COALESCE(x.value->>'label', '')), '') AS label
    FROM jsonb_array_elements(v_atts) x
    WHERE NULLIF(x.value->>'ingest_source_id','') IS NOT NULL
  )
  INSERT INTO public.session_sources (session_id, ingest_source_id, slot, label, playback_path)
  SELECT v_id, s.id, i.slot, COALESCE(i.label, s.name), s.playback_path
  FROM intent i
  JOIN public.ingest_sources s
    ON s.id = i.src
   AND s.owner_id = _owner
   AND s.lifecycle_status <> 'deleted'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.session_sources e
    WHERE e.session_id = v_id
      AND e.detached_at IS NULL
      AND e.slot = i.slot
      AND e.ingest_source_id = i.src
  );

  -- 4b) Attach runtime-route intents. Label/playback path derived server-side.
  WITH intent AS (
    SELECT
      (x.value->>'slot')::int AS slot,
      NULLIF(x.value->>'runtime_route_id','')::uuid AS route,
      NULLIF(btrim(COALESCE(x.value->>'label', '')), '') AS label
    FROM jsonb_array_elements(v_atts) x
    WHERE NULLIF(x.value->>'runtime_route_id','') IS NOT NULL
  )
  INSERT INTO public.session_sources (session_id, runtime_route_id, slot, label, playback_path)
  SELECT v_id, r.id, i.slot, COALESCE(i.label, r.name), r.playback_path
  FROM intent i
  JOIN public.session_runtime_routes r
    ON r.id = i.route
   AND r.owner_id = _owner
   AND r.session_id = v_id
   AND r.lifecycle_status = 'ready'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.session_sources e
    WHERE e.session_id = v_id
      AND e.detached_at IS NULL
      AND e.slot = i.slot
      AND e.runtime_route_id = i.route
  );

  -- 5) A completed/archived session holds no attachments. The underlying
  --    sources and runtime routes themselves are untouched here.
  IF COALESCE(v_status, '') IN ('completed', 'archived') THEN
    UPDATE public.session_sources
    SET detached_at = now()
    WHERE session_id = v_id AND detached_at IS NULL;
  END IF;

  SELECT count(*) INTO v_attached
  FROM public.session_sources
  WHERE session_id = v_id AND detached_at IS NULL;

  RETURN jsonb_build_object('session_id', v_id, 'active_attachments', v_attached);
END;
$function$;