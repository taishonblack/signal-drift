ALTER TABLE public.session_sources ADD COLUMN playback_path TEXT;

ALTER TABLE public.session_sources DROP CONSTRAINT session_sources_unique_slot;
ALTER TABLE public.session_sources DROP CONSTRAINT session_sources_unique_source;

CREATE UNIQUE INDEX session_sources_active_slot_uniq
  ON public.session_sources (session_id, slot)
  WHERE detached_at IS NULL;

CREATE UNIQUE INDEX session_sources_active_source_uniq
  ON public.session_sources (session_id, ingest_source_id)
  WHERE detached_at IS NULL;

-- Atomic session + attachment save.
-- _owner is ALWAYS the JWT-verified user id supplied by the save-session edge
-- function; it is never read from request JSON. EXECUTE is service_role only.
-- Normal attachment requires strict ownership: there is no admin bypass here.
CREATE OR REPLACE FUNCTION public.save_session_with_sources(
  _owner uuid,
  _session jsonb,
  _attachments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := _session->>'id';
  v_status text := _session->>'status';
  v_atts jsonb := COALESCE(_attachments, '[]'::jsonb);
  v_existing_owner uuid;
  v_att jsonb;
  v_slot int;
  v_source uuid;
  v_seen_slots int[] := '{}';
  v_seen_sources uuid[] := '{}';
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
      v_slot := (v_att->>'slot')::int;
      v_source := (v_att->>'ingest_source_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_attachment';
    END;

    IF v_slot IS NULL OR v_slot < 1 OR v_slot > 4 THEN RAISE EXCEPTION 'invalid_slot'; END IF;
    IF v_source IS NULL THEN RAISE EXCEPTION 'invalid_source'; END IF;
    IF v_slot = ANY(v_seen_slots) THEN RAISE EXCEPTION 'duplicate_slot'; END IF;
    IF v_source = ANY(v_seen_sources) THEN RAISE EXCEPTION 'duplicate_source'; END IF;
    v_seen_slots := v_seen_slots || v_slot;
    v_seen_sources := v_seen_sources || v_source;

    SELECT true, playback_path INTO v_found, v_path
    FROM public.ingest_sources
    WHERE id = v_source
      AND owner_id = _owner
      AND lifecycle_status <> 'deleted';

    IF NOT COALESCE(v_found, false) THEN RAISE EXCEPTION 'source_not_found'; END IF;
    IF v_path IS NULL OR v_path = '' THEN RAISE EXCEPTION 'source_not_ready'; END IF;
    v_found := false;
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
        AND (a.value->>'ingest_source_id')::uuid = ss.ingest_source_id
    );

  -- 4) Attach the intended set. Label and playback path are derived from the
  --    owner's own ingest_sources row, never from the browser.
  WITH intent AS (
    SELECT
      (x.value->>'slot')::int AS slot,
      (x.value->>'ingest_source_id')::uuid AS src,
      NULLIF(btrim(COALESCE(x.value->>'label', '')), '') AS label
    FROM jsonb_array_elements(v_atts) x
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

  -- 5) A completed/archived session holds no sources. The sources themselves
  --    are untouched and stay in the owner's library.
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
$$;

REVOKE ALL ON FUNCTION public.save_session_with_sources(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_session_with_sources(uuid, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.save_session_with_sources(uuid, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_session_with_sources(uuid, jsonb, jsonb) TO service_role;