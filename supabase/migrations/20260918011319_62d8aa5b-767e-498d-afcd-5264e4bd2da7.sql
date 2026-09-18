-- Phase E.5A: persistent engineering incident & evidence foundation.
-- No detectors. No severity. Server-authoritative write path.

CREATE TABLE public.signal_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  -- Durable plain reference: runtime rows are intentionally deleted during
  -- archive/teardown, so no FK here (incident history must survive that).
  runtime_route_id uuid,
  slot integer,
  source_name text NOT NULL,
  incident_type text NOT NULL,
  detector_id text NOT NULL,
  detector_version text NOT NULL,
  threshold jsonb NOT NULL DEFAULT '{}'::jsonb,
  observation_point text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  workflow_status text NOT NULL DEFAULT 'new',
  observed_started_at timestamptz NOT NULL,
  observed_ended_at timestamptz,
  detected_at timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  server_persisted_at timestamptz NOT NULL DEFAULT now(),
  duration_ms bigint,
  corroboration_count integer NOT NULL DEFAULT 1,
  recovery_note text,
  acked_by uuid,
  acked_at timestamptz,
  assigned_to uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_incidents_type_check CHECK (
    incident_type IN ('audio_silence','black_video','frozen_video','signal_loss','format_change')
  ),
  CONSTRAINT signal_incidents_state_check CHECK (state IN ('open','recovered')),
  CONSTRAINT signal_incidents_workflow_check CHECK (
    workflow_status IN ('new','acknowledged','investigating','resolved')
  ),
  CONSTRAINT signal_incidents_observation_point_check CHECK (
    observation_point IN ('browser_webrtc_pcm','browser_decoded_video','rtsp_publication','ffmpeg_input','playback_state')
  ),
  CONSTRAINT signal_incidents_corroboration_check CHECK (corroboration_count >= 1)
);

GRANT SELECT ON public.signal_incidents TO authenticated;
GRANT ALL ON public.signal_incidents TO service_role;

ALTER TABLE public.signal_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session participants can read incidents"
ON public.signal_incidents FOR SELECT TO authenticated
USING (
  public.is_session_owner(session_id, auth.uid())
  OR public.has_session_access(session_id, auth.uid())
);

CREATE TABLE public.signal_incident_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.signal_incidents(id) ON DELETE CASCADE,
  phase text NOT NULL,
  captured_at timestamptz NOT NULL,
  observation_point text NOT NULL,
  payload jsonb NOT NULL,
  still_image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_incident_evidence_phase_check CHECK (phase IN ('pre','event','post'))
);

GRANT SELECT ON public.signal_incident_evidence TO authenticated;
GRANT ALL ON public.signal_incident_evidence TO service_role;

ALTER TABLE public.signal_incident_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Evidence follows parent incident authorization"
ON public.signal_incident_evidence FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.signal_incidents i
    WHERE i.id = incident_id
      AND (
        public.is_session_owner(i.session_id, auth.uid())
        OR public.has_session_access(i.session_id, auth.uid())
      )
  )
);

CREATE INDEX signal_incidents_session_observed_idx
  ON public.signal_incidents (session_id, observed_started_at DESC);
CREATE INDEX signal_incidents_dedupe_idx
  ON public.signal_incidents (session_id, runtime_route_id, incident_type, state);
CREATE INDEX signal_incident_evidence_incident_idx
  ON public.signal_incident_evidence (incident_id, captured_at);

CREATE TRIGGER signal_incidents_set_updated_at
BEFORE UPDATE ON public.signal_incidents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Documented temporal correlation window for corroboration. Browser
-- detectors on different machines disagree by sampling interval + clock
-- skew; 90 s is wide enough to absorb that and narrow enough that two
-- genuinely distinct conditions are not merged.
CREATE OR REPLACE FUNCTION public.signal_incident_correlation_window()
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$ SELECT interval '90 seconds' $$;

-- Trusted write path: create-or-corroborate.
CREATE OR REPLACE FUNCTION public.submit_signal_incident(
  _session_id text,
  _runtime_route_id uuid,
  _slot integer,
  _source_name text,
  _incident_type text,
  _detector_id text,
  _detector_version text,
  _threshold jsonb,
  _observation_point text,
  _observed_started_at timestamptz,
  _detected_at timestamptz,
  _evidence jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.signal_incidents;
  v_id uuid;
  v_outcome text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF NOT (is_session_owner(_session_id, v_uid) OR has_session_access(_session_id, v_uid)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Serialize submissions for this session+route+type so concurrent
  -- detector clients cannot create duplicate incidents.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(_session_id || ':' || coalesce(_runtime_route_id::text, '-') || ':' || _incident_type, 77)
  );

  SELECT * INTO v_existing
  FROM public.signal_incidents
  WHERE session_id = _session_id
    AND runtime_route_id IS NOT DISTINCT FROM _runtime_route_id
    AND incident_type = _incident_type
    AND (
      state = 'open'
      OR observed_started_at >= _observed_started_at - signal_incident_correlation_window()
    )
    AND observed_started_at <= _observed_started_at + signal_incident_correlation_window()
  ORDER BY observed_started_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.signal_incidents
       SET corroboration_count = corroboration_count + 1,
           observed_started_at = LEAST(observed_started_at, _observed_started_at),
           server_received_at = now()
     WHERE id = v_existing.id;
    v_id := v_existing.id;
    v_outcome := 'corroborated';
  ELSE
    INSERT INTO public.signal_incidents (
      session_id, runtime_route_id, slot, source_name, incident_type,
      detector_id, detector_version, threshold, observation_point,
      observed_started_at, detected_at
    ) VALUES (
      _session_id, _runtime_route_id, _slot, _source_name, _incident_type,
      _detector_id, _detector_version, coalesce(_threshold, '{}'::jsonb), _observation_point,
      _observed_started_at, _detected_at
    )
    RETURNING id INTO v_id;
    v_outcome := 'created';
  END IF;

  IF _evidence IS NOT NULL THEN
    INSERT INTO public.signal_incident_evidence (
      incident_id, phase, captured_at, observation_point, payload, still_image_path
    ) VALUES (
      v_id,
      coalesce(_evidence->>'phase', 'event'),
      coalesce((_evidence->>'captured_at')::timestamptz, _detected_at),
      coalesce(_evidence->>'observation_point', _observation_point),
      coalesce(_evidence->'payload', '{}'::jsonb),
      _evidence->>'still_image_path'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'outcome', v_outcome, 'incident_id', v_id);
END;
$$;

-- Trusted recovery path (not invoked by any detector in E.5A).
CREATE OR REPLACE FUNCTION public.recover_signal_incident(
  _incident_id uuid,
  _observed_ended_at timestamptz,
  _recovery_note text DEFAULT NULL,
  _evidence jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inc public.signal_incidents;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_inc FROM public.signal_incidents WHERE id = _incident_id;
  IF v_inc.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT (is_session_owner(v_inc.session_id, v_uid) OR has_session_access(v_inc.session_id, v_uid)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF v_inc.state = 'recovered' THEN
    RETURN jsonb_build_object(
      'ok', true, 'outcome', 'already_recovered', 'incident_id', v_inc.id,
      'duration_ms', v_inc.duration_ms
    );
  END IF;

  UPDATE public.signal_incidents
     SET state = 'recovered',
         observed_ended_at = _observed_ended_at,
         duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (_observed_ended_at - observed_started_at)) * 1000)::bigint),
         recovery_note = coalesce(_recovery_note, recovery_note),
         server_persisted_at = now()
   WHERE id = _incident_id
  RETURNING * INTO v_inc;

  IF _evidence IS NOT NULL THEN
    INSERT INTO public.signal_incident_evidence (
      incident_id, phase, captured_at, observation_point, payload, still_image_path
    ) VALUES (
      v_inc.id,
      coalesce(_evidence->>'phase', 'post'),
      coalesce((_evidence->>'captured_at')::timestamptz, _observed_ended_at),
      coalesce(_evidence->>'observation_point', v_inc.observation_point),
      coalesce(_evidence->'payload', '{}'::jsonb),
      _evidence->>'still_image_path'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'outcome', 'recovered', 'incident_id', v_inc.id,
    'duration_ms', v_inc.duration_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_signal_incident(text, uuid, integer, text, text, text, text, jsonb, text, timestamptz, timestamptz, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_signal_incident(text, uuid, integer, text, text, text, text, jsonb, text, timestamptz, timestamptz, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.recover_signal_incident(uuid, timestamptz, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.recover_signal_incident(uuid, timestamptz, text, jsonb) TO authenticated, service_role;