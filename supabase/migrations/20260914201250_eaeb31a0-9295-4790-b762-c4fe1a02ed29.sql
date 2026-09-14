-- The database's default privileges granted blanket table access; scope it down.
REVOKE ALL ON public.ingest_sources FROM anon;
REVOKE ALL ON public.ingest_sources FROM authenticated;
REVOKE ALL ON public.session_sources FROM anon;
REVOKE ALL ON public.session_sources FROM authenticated;

GRANT SELECT ON public.ingest_sources TO authenticated;
GRANT INSERT (owner_id, name, connection_mode) ON public.ingest_sources TO authenticated;
GRANT UPDATE (name, connection_mode) ON public.ingest_sources TO authenticated;
GRANT DELETE ON public.ingest_sources TO authenticated;
GRANT ALL ON public.ingest_sources TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_sources TO authenticated;
GRANT ALL ON public.session_sources TO service_role;