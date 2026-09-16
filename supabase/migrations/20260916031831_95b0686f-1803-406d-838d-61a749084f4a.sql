REVOKE ALL ON public.session_runtime_routes FROM anon;
REVOKE ALL ON public.session_runtime_routes FROM authenticated;
REVOKE ALL ON public.session_runtime_route_history FROM anon;
REVOKE ALL ON public.session_runtime_route_history FROM authenticated;

GRANT SELECT ON public.session_runtime_routes TO authenticated;
GRANT SELECT ON public.session_runtime_route_history TO authenticated;
GRANT ALL ON public.session_runtime_routes TO service_role;
GRANT ALL ON public.session_runtime_route_history TO service_role;