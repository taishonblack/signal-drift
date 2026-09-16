REVOKE EXECUTE ON FUNCTION public.reserve_session_runtime_route(uuid, text, integer, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_session_runtime_route(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_session_runtime_route(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_runtime_route_teardown_failure(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_session_runtime_route(uuid, uuid, text) FROM PUBLIC, anon, authenticated;