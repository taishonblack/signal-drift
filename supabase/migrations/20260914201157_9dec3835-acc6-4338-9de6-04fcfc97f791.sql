CREATE OR REPLACE FUNCTION public.guard_ingest_source_infra_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Privileged writers: the service role (edge functions / admin server code)
  -- and the database owner running migrations.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.srt_port IS NOT NULL OR NEW.playback_path IS NOT NULL THEN
      RAISE EXCEPTION 'infrastructure-managed columns are server-controlled';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.infrastructure_source_id IS DISTINCT FROM OLD.infrastructure_source_id
     OR NEW.srt_port IS DISTINCT FROM OLD.srt_port
     OR NEW.playback_path IS DISTINCT FROM OLD.playback_path
     OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
     OR NEW.connection_status IS DISTINCT FROM OLD.connection_status THEN
    RAISE EXCEPTION 'infrastructure-managed columns are server-controlled';
  END IF;

  RETURN NEW;
END;
$$;