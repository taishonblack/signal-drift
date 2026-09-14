-- =====================================================================
-- Phase 1: Source Registry Foundation
-- =====================================================================

-- 1) ingest_sources: the persistent, reusable MAKO Receive resource.
CREATE TABLE public.ingest_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  connection_mode TEXT NOT NULL DEFAULT 'receive',
  infrastructure_source_id TEXT NOT NULL UNIQUE,
  srt_port INTEGER,
  playback_path TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'provisioning',
  connection_status TEXT NOT NULL DEFAULT 'unknown',
  connection_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ingest_sources_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT ingest_sources_connection_mode_valid
    CHECK (connection_mode IN ('receive', 'connect')),
  CONSTRAINT ingest_sources_lifecycle_status_valid
    CHECK (lifecycle_status IN ('provisioning', 'ready', 'error', 'deleting', 'deleted')),
  CONSTRAINT ingest_sources_connection_status_valid
    CHECK (connection_status IN ('unknown', 'offline', 'connecting', 'connected')),
  CONSTRAINT ingest_sources_srt_port_range
    CHECK (srt_port IS NULL OR (srt_port BETWEEN 1 AND 65535))
);

CREATE INDEX ingest_sources_owner_idx ON public.ingest_sources (owner_id);

-- Column-level privileges: authenticated clients may never write the
-- infrastructure-managed columns (infrastructure_source_id, srt_port,
-- playback_path) or the status columns. service_role owns those.
GRANT SELECT ON public.ingest_sources TO authenticated;
GRANT INSERT (owner_id, name, connection_mode) ON public.ingest_sources TO authenticated;
GRANT UPDATE (name, connection_mode) ON public.ingest_sources TO authenticated;
GRANT DELETE ON public.ingest_sources TO authenticated;
GRANT ALL ON public.ingest_sources TO service_role;

ALTER TABLE public.ingest_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own ingest sources"
  ON public.ingest_sources FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Admins read all ingest sources"
  ON public.ingest_sources FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner inserts own ingest sources"
  ON public.ingest_sources FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner updates own ingest sources"
  ON public.ingest_sources FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins manage all ingest sources"
  ON public.ingest_sources FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner deletes own ingest sources"
  ON public.ingest_sources FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Defence in depth: reject any non-service-role attempt to set or change
-- infrastructure-managed columns, regardless of how the request arrives.
CREATE OR REPLACE FUNCTION public.guard_ingest_source_infra_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  caller TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
  IF caller IS NULL OR caller = 'service_role' THEN
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

CREATE TRIGGER ingest_sources_guard_infra
  BEFORE INSERT OR UPDATE ON public.ingest_sources
  FOR EACH ROW EXECUTE FUNCTION public.guard_ingest_source_infra_columns();

CREATE TRIGGER ingest_sources_updated_at
  BEFORE UPDATE ON public.ingest_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Helper: may this user attach the given ingest source?
CREATE OR REPLACE FUNCTION public.can_use_ingest_source(_source_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ingest_sources
    WHERE id = _source_id
      AND (owner_id = _user_id OR public.has_role(_user_id, 'admin'))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_use_ingest_source(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_ingest_source(UUID, UUID) TO authenticated, service_role;

-- 3) session_sources: where a persistent source is being used.
CREATE TABLE public.session_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  ingest_source_id UUID NOT NULL REFERENCES public.ingest_sources(id) ON DELETE RESTRICT,
  slot SMALLINT NOT NULL,
  label TEXT,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_sources_slot_range CHECK (slot BETWEEN 1 AND 4),
  CONSTRAINT session_sources_label_len
    CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 120),
  CONSTRAINT session_sources_unique_slot UNIQUE (session_id, slot),
  CONSTRAINT session_sources_unique_source UNIQUE (session_id, ingest_source_id)
);

CREATE INDEX session_sources_source_idx ON public.session_sources (ingest_source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_sources TO authenticated;
GRANT ALL ON public.session_sources TO service_role;

ALTER TABLE public.session_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read session sources"
  ON public.session_sources FOR SELECT TO authenticated
  USING (
    public.is_session_owner(session_id, auth.uid())
    OR public.has_session_access(session_id, auth.uid())
  );

CREATE POLICY "Session owner attaches own sources"
  ON public.session_sources FOR INSERT TO authenticated
  WITH CHECK (
    public.is_session_owner(session_id, auth.uid())
    AND public.can_use_ingest_source(ingest_source_id, auth.uid())
  );

CREATE POLICY "Session owner updates session sources"
  ON public.session_sources FOR UPDATE TO authenticated
  USING (public.is_session_owner(session_id, auth.uid()))
  WITH CHECK (
    public.is_session_owner(session_id, auth.uid())
    AND public.can_use_ingest_source(ingest_source_id, auth.uid())
  );

CREATE POLICY "Session owner detaches session sources"
  ON public.session_sources FOR DELETE TO authenticated
  USING (public.is_session_owner(session_id, auth.uid()));