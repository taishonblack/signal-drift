-- 1) Lock down server-only SECURITY DEFINER functions (used only by backend edge functions)
REVOKE EXECUTE ON FUNCTION public.hash_session_pin(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_session_pin(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_session_pin(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_session_pin(text, text) TO service_role;

-- 2) Exclude all public tables from the pg_graphql schema (app uses PostgREST with RLS)
COMMENT ON TABLE public.address_book IS E'@graphql({"exclude": true})';
COMMENT ON TABLE public.feedback IS E'@graphql({"exclude": true})';
COMMENT ON TABLE public.profiles IS E'@graphql({"exclude": true})';
COMMENT ON TABLE public.session_focus IS E'@graphql({"exclude": true})';
COMMENT ON TABLE public.session_timeline_entries IS E'@graphql({"exclude": true})';
COMMENT ON TABLE public.sessions IS E'@graphql({"exclude": true})';
COMMENT ON TABLE public.shared_session_access IS E'@graphql({"exclude": true})';
COMMENT ON TABLE public.ui_preferences IS E'@graphql({"exclude": true})';
COMMENT ON TABLE public.user_roles IS E'@graphql({"exclude": true})';

-- 3) Server-side validation for public feedback submissions
CREATE OR REPLACE FUNCTION public.validate_feedback()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $func$
BEGIN
  IF length(NEW.first_name) < 1 OR length(NEW.first_name) > 80 THEN
    RAISE EXCEPTION 'invalid first_name length';
  END IF;
  IF length(NEW.last_name) < 1 OR length(NEW.last_name) > 80 THEN
    RAISE EXCEPTION 'invalid last_name length';
  END IF;
  IF length(NEW.email) > 254 OR NEW.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'invalid email format';
  END IF;
  IF length(NEW.message) < 1 OR length(NEW.message) > 4000 THEN
    RAISE EXCEPTION 'invalid message length';
  END IF;
  IF NEW.page_url IS NOT NULL THEN
    NEW.page_url := left(NEW.page_url, 512);
  END IF;
  IF NEW.user_agent IS NOT NULL THEN
    NEW.user_agent := left(NEW.user_agent, 512);
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS feedback_validate ON public.feedback;
CREATE TRIGGER feedback_validate
BEFORE INSERT ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.validate_feedback();