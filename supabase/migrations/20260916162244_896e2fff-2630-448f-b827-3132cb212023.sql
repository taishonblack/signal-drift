-- Phase C: server-side runtime-route reservation, finalization and archival.
-- All security definer, owner-enforced, service-role callable only.

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
BEGIN
  IF _owner IS NULL THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF _session_id IS NULL OR _session_id = '' THEN RAISE EXCEPTION 'session_id_required'; END IF;
  IF _slot IS NULL OR _slot < 1 OR _slot > 4 THEN RAISE EXCEPTION 'invalid_slot'; END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF _host IS NULL OR btrim(_host) = '' THEN RAISE EXCEPTION 'invalid_host'; END IF;
  IF _port IS NULL OR _port < 1 OR _port > 65535 THEN RAISE EXCEPTION 'invalid_port'; END IF;

  SELECT owner_id INTO v_existing_owner FROM public.sessions WHERE id = _session_id FOR UPDATE;
  IF v_existing_owner IS NULL THEN
    -- Hidden provisioning session. It stays draft (and therefore invisible to
    -- normal operator hydration) until provisioning completes.
    INSERT INTO public.sessions (id, owner_id, name, status, payload)
    VALUES (_session_id, _owner, btrim(_name), 'draft', '{}'::jsonb);
  ELSIF v_existing_owner <> _owner THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_route
  FROM public.session_runtime_routes
  WHERE session_id = _session_id AND slot = _slot
  FOR UPDATE;

  IF v_route.id IS NULL THEN
    INSERT INTO public.session_runtime_routes
      (owner_id, session_id, slot, name, remote_host, remote_port,
       lifecycle_status, connection_status)
    VALUES
      (_owner, _session_id, _slot, btrim(_name), btrim(_host), _port,
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

  IF v_route.remote_host <> btrim(_host) OR v_route.remote_port <> _port THEN
    RETURN jsonb_build_object('status', 'endpoint_conflict', 'route_id', v_route.id);
  END IF;

  -- Same endpoint: the friendly name may be refreshed, identity never is.
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

CREATE OR REPLACE FUNCTION public.finalize_session_runtime_route(
  _owner uuid,
  _route_id uuid,
  _infrastructure_source_id text,
  _playback_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_route public.session_runtime_routes;
BEGIN
  IF _infrastructure_source_id IS NULL OR _infrastructure_source_id = ''
     OR _playback_path IS NULL OR _playback_path = '' THEN
    RAISE EXCEPTION 'invalid_infrastructure_identity';
  END IF;

  UPDATE public.session_runtime_routes
  SET infrastructure_source_id = _infrastructure_source_id,
      playback_path = _playback_path,
      lifecycle_status = 'ready',
      last_error = NULL
  WHERE id = _route_id AND owner_id = _owner
  RETURNING * INTO v_route;

  IF v_route.id IS NULL THEN RAISE EXCEPTION 'route_not_found'; END IF;

  RETURN jsonb_build_object(
    'route_id', v_route.id,
    'lifecycle_status', v_route.lifecycle_status,
    'playback_path', v_route.playback_path
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_session_runtime_route(
  _owner uuid,
  _route_id uuid,
  _error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_route public.session_runtime_routes;
BEGIN
  UPDATE public.session_runtime_routes
  SET lifecycle_status = CASE WHEN lifecycle_status = 'tearing_down' THEN 'tearing_down' ELSE 'error' END,
      last_error = left(COALESCE(_error, 'unknown'), 500)
  WHERE id = _route_id AND owner_id = _owner
  RETURNING * INTO v_route;

  IF v_route.id IS NULL THEN RAISE EXCEPTION 'route_not_found'; END IF;
  RETURN jsonb_build_object('route_id', v_route.id, 'lifecycle_status', v_route.lifecycle_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_runtime_route_teardown_failure(
  _owner uuid,
  _route_id uuid,
  _error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_route public.session_runtime_routes;
BEGIN
  UPDATE public.session_runtime_routes
  SET lifecycle_status = 'tearing_down',
      teardown_requested_at = COALESCE(teardown_requested_at, now()),
      teardown_attempts = teardown_attempts + 1,
      teardown_error = left(COALESCE(_error, 'unknown'), 500)
  WHERE id = _route_id AND owner_id = _owner
  RETURNING * INTO v_route;

  IF v_route.id IS NULL THEN RAISE EXCEPTION 'route_not_found'; END IF;
  RETURN jsonb_build_object(
    'route_id', v_route.id,
    'lifecycle_status', v_route.lifecycle_status,
    'teardown_attempts', v_route.teardown_attempts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_session_runtime_route(
  _owner uuid,
  _route_id uuid,
  _final_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_route public.session_runtime_routes;
BEGIN
  IF _final_status IS NULL OR _final_status NOT IN ('torn_down', 'error') THEN
    RAISE EXCEPTION 'invalid_final_status';
  END IF;

  SELECT * INTO v_route
  FROM public.session_runtime_routes
  WHERE id = _route_id AND owner_id = _owner
  FOR UPDATE;

  IF v_route.id IS NULL THEN RAISE EXCEPTION 'route_not_found'; END IF;

  INSERT INTO public.session_runtime_route_history (
    id, owner_id, session_id, slot, name, remote_host, remote_port,
    infrastructure_source_id, playback_path, final_lifecycle_status,
    connection_status, teardown_requested_at, teardown_completed_at,
    teardown_attempts, teardown_error, route_created_at
  ) VALUES (
    v_route.id, v_route.owner_id, v_route.session_id, v_route.slot, v_route.name,
    v_route.remote_host, v_route.remote_port, v_route.infrastructure_source_id,
    v_route.playback_path, _final_status, v_route.connection_status,
    COALESCE(v_route.teardown_requested_at, now()), now(),
    GREATEST(v_route.teardown_attempts, 1), v_route.teardown_error, v_route.created_at
  )
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.session_runtime_routes WHERE id = v_route.id;

  RETURN jsonb_build_object('archived', true, 'route_id', v_route.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_session_runtime_route(uuid, text, integer, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_session_runtime_route(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_session_runtime_route(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_runtime_route_teardown_failure(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_session_runtime_route(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reserve_session_runtime_route(uuid, text, integer, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_session_runtime_route(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_session_runtime_route(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_runtime_route_teardown_failure(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_session_runtime_route(uuid, uuid, text) TO service_role;