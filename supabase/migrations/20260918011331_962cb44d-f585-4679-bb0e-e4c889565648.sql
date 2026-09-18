CREATE OR REPLACE FUNCTION public.signal_incident_correlation_window()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT interval '90 seconds' $$;

REVOKE ALL ON FUNCTION public.signal_incident_correlation_window() FROM public;
GRANT EXECUTE ON FUNCTION public.signal_incident_correlation_window() TO authenticated, service_role;