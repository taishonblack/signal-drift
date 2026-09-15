-- A reservation row exists before the infrastructure identity is known.
ALTER TABLE public.ingest_sources ALTER COLUMN infrastructure_source_id DROP NOT NULL;

-- Invariant: only a 'provisioning' row may lack infrastructure identity.
CREATE OR REPLACE FUNCTION public.enforce_ingest_source_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lifecycle_status <> 'provisioning' THEN
    IF NEW.infrastructure_source_id IS NULL
       OR NEW.srt_port IS NULL
       OR NEW.playback_path IS NULL THEN
      RAISE EXCEPTION 'a non-provisioning ingest source requires infrastructure_source_id, srt_port and playback_path';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ingest_sources_enforce_invariants ON public.ingest_sources;
CREATE TRIGGER ingest_sources_enforce_invariants
  BEFORE INSERT OR UPDATE ON public.ingest_sources
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ingest_source_invariants();

-- Atomic per-owner slot reservation. Serializes concurrent create attempts for
-- the same owner so the active-source quota cannot be exceeded by a race.
CREATE OR REPLACE FUNCTION public.reserve_ingest_source_slot(
  _owner uuid,
  _name text,
  _max integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_owner::text, 0));

  SELECT count(*) INTO v_count
  FROM public.ingest_sources
  WHERE owner_id = _owner
    AND lifecycle_status <> 'deleted';

  IF v_count >= _max THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ingest_sources
    (owner_id, name, connection_mode, lifecycle_status, connection_status)
  VALUES
    (_owner, _name, 'receive', 'provisioning', 'unknown')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ingest_source_slot(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_ingest_source_slot(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_ingest_source_slot(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ingest_source_slot(uuid, text, integer) TO service_role;