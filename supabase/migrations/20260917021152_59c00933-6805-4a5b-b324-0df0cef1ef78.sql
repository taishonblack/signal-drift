-- =========================================================
-- Phase D: lease-based presence, endpoint exclusivity, release orchestration
-- =========================================================

-- 1) Per-client presence ("lease holders"). One row per open client instance.
--    A session is alive while at least one of its rows is unexpired.
CREATE TABLE public.session_lease_holders (
  session_id text NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  client_instance_id uuid NOT NULL,
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  renewed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, client_instance_id)
);

GRANT SELECT ON public.session_lease_holders TO authenticated;
GRANT ALL ON public.session_lease_holders TO service_role;

ALTER TABLE public.session_lease_holders ENABLE ROW LEVEL SECURITY;

-- Read-only for the session owner. Every write happens server-side.
CREATE POLICY "Owner reads own session presence"
  ON public.session_lease_holders FOR SELECT TO authenticated
  USING (public.is_session_owner(session_id, auth.uid()));

CREATE INDEX session_lease_holders_expires_idx
  ON public.session_lease_holders (expires_at);
CREATE INDEX session_lease_holders_session_idx
  ON public.session_lease_holders (session_id);

CREATE TRIGGER session_lease_holders_updated_at
  BEFORE UPDATE ON public.session_lease_holders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Renew one client's presence. Owner-enforced; TTL is server-controlled.
CREATE OR REPLACE FUNCTION public.renew_session_lease(
  _owner uuid,
  _session_id text,
  _client_instance_id uuid,
  _ttl_seconds integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.sessions;
  v_ttl integer := LEAST(GREATEST(COALESCE(_ttl_seconds, 45), 15), 300);
  v_expires timestamptz;
BEGIN
  IF _owner IS NULL THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF _session_id IS NULL OR _session_id = '' THEN RAISE EXCEPTION 'session_id_required'; END IF;
  IF _client_instance_id IS NULL THEN RAISE EXCEPTION 'client_instance_required'; END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = _session_id;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.owner_id <> _owner THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- A terminal session is never kept alive by presence.
  IF v_session.status IN ('completed', 'archived') THEN
    RETURN jsonb_build_object('renewed', false, 'reason', 'session_terminal');
  END IF;

  v_expires := now() + make_interval(secs => v_ttl);

  INSERT INTO public.session_lease_holders
    (session_id, client_instance_id, holder_user_id, renewed_at, expires_at)
  VALUES (_session_id, _client_instance_id, _owner, now(), v_expires)
  ON CONFLICT (session_id, client_instance_id) DO UPDATE
    SET renewed_at = now(),
        expires_at = v_expires,
        holder_user_id = EXCLUDED.holder_user_id;

  RETURN jsonb_build_object(
    'renewed', true,
    'expires_at', v_expires,
    'ttl_seconds', v_ttl
  );
END;
$function$;

-- 3) Sessions whose every client presence has expired.
--    A session that never took a lease (legacy / pre-Phase D) is never touched:
--    it must HAVE holder rows and have none that are still valid.
CREATE OR REPLACE FUNCTION public.sessions_with_expired_leases(_limit integer DEFAULT 50)
RETURNS TABLE (session_id text, owner_id uuid, last_seen_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id,
         s.owner_id,
         (SELECT max(h.renewed_at) FROM public.session_lease_holders h WHERE h.session_id = s.id)
  FROM public.sessions s
  WHERE s.status IN ('active', 'paused', 'scheduled')
    AND EXISTS (SELECT 1 FROM public.session_lease_holders h WHERE h.session_id = s.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.session_lease_holders h
      WHERE h.session_id = s.id AND h.expires_at > now()
    )
  ORDER BY s.updated_at
  LIMIT GREATEST(COALESCE(_limit, 50), 1);
$function$;

-- 4) Endpoint occupancy. Occupancy is a property of the live ROUTE row, never
--    of sessions.status: a completed session with an unconfirmed teardown still
--    holds its endpoint until the row is archived.
CREATE OR REPLACE FUNCTION public.normalize_endpoint_host(_host text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT lower(btrim(COALESCE(_host, '')));
$function$;

-- Privacy-safe hint: boolean only. Never leaks session, owner or route identity.
CREATE OR REPLACE FUNCTION public.check_endpoint_availability(_host text, _port integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.session_runtime_routes r
    WHERE public.normalize_endpoint_host(r.remote_host) = public.normalize_endpoint_host(_host)
      AND r.remote_port = _port
  );
$function$;

REVOKE ALL ON FUNCTION public.check_endpoint_availability(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_endpoint_availability(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_endpoint_availability(text, integer) TO service_role;

CREATE INDEX session_runtime_routes_endpoint_idx
  ON public.session_runtime_routes (public.normalize_endpoint_host(remote_host), remote_port);

-- 5) Reservation gains global endpoint exclusivity. The per-endpoint advisory
--    lock serialises concurrent Start Monitoring attempts for the same
--    endpoint, so two callers can never both pass the occupancy check.
CREATE OR REPLACE FUNCTION public.reserve_session_runtime_route(
  _owner uuid,
  _session_id text,
  _slot integer,
  _name text,
  _host text,
  _port integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_owner uuid;
  v_route public.session_runtime_routes;
  v_host text := btrim(_host);
  v_norm text;
  v_occupied uuid;
BEGIN
  IF _owner IS NULL THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF _session_id IS NULL OR _session_id = '' THEN RAISE EXCEPTION 'session_id_required'; END IF;
  IF _slot IS NULL OR _slot < 1 OR _slot > 4 THEN RAISE EXCEPTION 'invalid_slot'; END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF _host IS NULL OR v_host = '' THEN RAISE EXCEPTION 'invalid_host'; END IF;
  IF _port IS NULL OR _port < 1 OR _port > 65535 THEN RAISE EXCEPTION 'invalid_port'; END IF;

  v_norm := public.normalize_endpoint_host(v_host);

  -- Serialise every reservation attempt for this endpoint, across all owners.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_norm || ':' || _port::text, 42));

  SELECT owner_id INTO v_existing_owner FROM public.sessions WHERE id = _session_id FOR UPDATE;
  IF v_existing_owner IS NULL THEN
    INSERT INTO public.sessions (id, owner_id, name, status, payload)
    VALUES (_session_id, _owner, btrim(_name), 'draft', '{}'::jsonb);
  ELSIF v_existing_owner <> _owner THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_route
  FROM public.session_runtime_routes
  WHERE session_id = _session_id AND slot = _slot
  FOR UPDATE;

  -- Global exclusivity: any OTHER live route already on this endpoint blocks us,
  -- whatever its lifecycle status and whoever owns it.
  SELECT r.id INTO v_occupied
  FROM public.session_runtime_routes r
  WHERE public.normalize_endpoint_host(r.remote_host) = v_norm
    AND r.remote_port = _port
    AND (v_route.id IS NULL OR r.id <> v_route.id)
  LIMIT 1;

  IF v_occupied IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'endpoint_in_use');
  END IF;

  IF v_route.id IS NULL THEN
    INSERT INTO public.session_runtime_routes
      (owner_id, session_id, slot, name, remote_host, remote_port,
       lifecycle_status, connection_status)
    VALUES
      (_owner, _session_id, _slot, btrim(_name), v_host, _port,
       'provisioning', 'unknown')
    RETURNING * INTO v_route;

    RETURN jsonb_build_object(
      'status', 'reserved',
      'route_id', v_route.id,
      'lifecycle_status', v_route.lifecycle_status
    );
  END IF;

  IF v_route.owner_id <> _owner THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_route.lifecycle_status = 'tearing_down' THEN
    RETURN jsonb_build_object('status', 'route_tearing_down', 'route_id', v_route.id);
  END IF;

  IF v_route.remote_host <> v_host OR v_route.remote_port <> _port THEN
    RETURN jsonb_build_object('status', 'endpoint_conflict', 'route_id', v_route.id);
  END IF;

  UPDATE public.session_runtime_routes
  SET name = btrim(_name)
  WHERE id = v_route.id
  RETURNING * INTO v_route;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_route.lifecycle_status = 'ready' THEN 'ready' ELSE 'resume' END,
    'route_id', v_route.id,
    'lifecycle_status', v_route.lifecycle_status,
    'infrastructure_source_id', v_route.infrastructure_source_id,
    'playback_path', v_route.playback_path
  );
END;
$function$;

-- 6) Release orchestration, steps 1-4 of the teardown sequence, transactional:
--    invalidate presence -> complete session -> detach sources -> flag routes.
--    Returns the routes whose upstream caller must now be deleted. Endpoint
--    occupancy is deliberately retained until each route is archived.
CREATE OR REPLACE FUNCTION public.begin_session_release(
  _session_id text,
  _reason text DEFAULT 'lease_expired'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.sessions;
  v_routes jsonb;
BEGIN
  IF _session_id IS NULL OR _session_id = '' THEN RAISE EXCEPTION 'session_id_required'; END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = _session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- 1) presence is invalidated first, so nothing can "revive" the session
  DELETE FROM public.session_lease_holders WHERE session_id = _session_id;

  -- 2) session becomes terminal (a draft that never completed stays draft)
  IF v_session.status NOT IN ('completed', 'archived', 'draft') THEN
    UPDATE public.sessions SET status = 'completed' WHERE id = _session_id;
  END IF;

  -- 3) detach attachments BEFORE any route can be archived
  --    (session_sources.runtime_route_id is ON DELETE RESTRICT)
  UPDATE public.session_sources
  SET detached_at = now()
  WHERE session_id = _session_id AND detached_at IS NULL;

  -- 4) flag every live route for teardown. A route that never reached ready has
  --    no infrastructure identity, so it cannot enter tearing_down (invariant
  --    trigger) — it becomes error and reconciliation resolves it by key.
  UPDATE public.session_runtime_routes
  SET lifecycle_status = CASE
        WHEN infrastructure_source_id IS NOT NULL AND playback_path IS NOT NULL
          THEN 'tearing_down'
        ELSE 'error'
      END,
      teardown_requested_at = COALESCE(teardown_requested_at, now()),
      teardown_error = left(COALESCE(_reason, 'release'), 500)
  WHERE session_id = _session_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'route_id', r.id,
           'owner_id', r.owner_id,
           'slot', r.slot,
           'infrastructure_source_id', r.infrastructure_source_id,
           'lifecycle_status', r.lifecycle_status
         )), '[]'::jsonb)
  INTO v_routes
  FROM public.session_runtime_routes r
  WHERE r.session_id = _session_id;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'owner_id', v_session.owner_id,
    'reason', COALESCE(_reason, 'release'),
    'routes', v_routes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.renew_session_lease(uuid, text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sessions_with_expired_leases(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_session_release(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.renew_session_lease(uuid, text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sessions_with_expired_leases(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_session_release(text, text) TO service_role;