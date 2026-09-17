CREATE OR REPLACE FUNCTION public.transfer_session_ownership(_session_id text, _from uuid, _to uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_routes int := 0;
BEGIN
  IF _session_id IS NULL OR _session_id = '' THEN RAISE EXCEPTION 'session_id_required'; END IF;
  IF _from IS NULL OR _to IS NULL THEN RAISE EXCEPTION 'identities_required'; END IF;

  SELECT owner_id INTO v_owner FROM public.sessions WHERE id = _session_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- Idempotent: a repeated transfer is a no-op, not an error.
  IF v_owner = _to THEN
    RETURN jsonb_build_object('transferred', false, 'reason', 'already_owned', 'session_id', _session_id);
  END IF;

  IF v_owner <> _from THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.sessions SET owner_id = _to WHERE id = _session_id;

  -- Runtime routes keep their id, infrastructure_source_id and playback_path:
  -- only the owner reference moves, so the running caller is untouched.
  UPDATE public.session_runtime_routes SET owner_id = _to WHERE session_id = _session_id;
  GET DIAGNOSTICS v_routes = ROW_COUNT;

  UPDATE public.session_runtime_route_history SET owner_id = _to WHERE session_id = _session_id;

  -- Presence stays valid: existing lease rows move to the new identity unless
  -- that identity already holds the same client row.
  DELETE FROM public.session_lease_holders h
  WHERE h.session_id = _session_id
    AND h.holder_user_id = _from
    AND EXISTS (
      SELECT 1 FROM public.session_lease_holders o
      WHERE o.session_id = _session_id
        AND o.client_instance_id = h.client_instance_id
        AND o.holder_user_id = _to
    );

  UPDATE public.session_lease_holders
  SET holder_user_id = _to
  WHERE session_id = _session_id AND holder_user_id = _from;

  DELETE FROM public.shared_session_access
  WHERE session_id = _session_id AND user_id = _from;

  RETURN jsonb_build_object(
    'transferred', true,
    'session_id', _session_id,
    'routes', v_routes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_session_ownership(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_session_ownership(text, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.transfer_session_ownership(text, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_session_ownership(text, uuid, uuid) TO service_role;