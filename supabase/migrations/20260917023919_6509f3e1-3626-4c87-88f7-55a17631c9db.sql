-- Phase D archival fix: allow a confirmed-dead runtime route to archive while
-- preserving historical attachment display data.

-- 1. XOR integrity now applies to LIVE attachments only. A detached historical
--    row may keep its label/playback snapshot with no reference at all.
ALTER TABLE public.session_sources
  DROP CONSTRAINT session_sources_single_reference;

ALTER TABLE public.session_sources
  ADD CONSTRAINT session_sources_single_reference
  CHECK (
    detached_at IS NOT NULL
    OR num_nonnulls(ingest_source_id, runtime_route_id) = 1
  );

-- 2. Archival clears the historical route reference in the SAME transaction as
--    the delete. This RPC is service-role only and is called only after upstream
--    caller deletion is confirmed, so ON DELETE RESTRICT remains the backstop
--    for every other path.
CREATE OR REPLACE FUNCTION public.archive_session_runtime_route(_owner uuid, _route_id uuid, _final_status text)
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

  -- Release the historical attachment reference. label/playback_path/slot and
  -- the timestamps are retained, and the full route record now lives in history.
  UPDATE public.session_sources
  SET runtime_route_id = NULL,
      detached_at = COALESCE(detached_at, now())
  WHERE runtime_route_id = v_route.id;

  DELETE FROM public.session_runtime_routes WHERE id = v_route.id;

  RETURN jsonb_build_object('archived', true, 'route_id', v_route.id);
END;
$function$;