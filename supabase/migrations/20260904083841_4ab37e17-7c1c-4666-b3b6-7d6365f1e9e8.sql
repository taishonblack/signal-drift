-- 1. Roles infrastructure (separate table, never on profiles)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2. feedback: validation + admin-only read
ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_first_name_len,
  DROP CONSTRAINT IF EXISTS feedback_last_name_len,
  DROP CONSTRAINT IF EXISTS feedback_email_valid,
  DROP CONSTRAINT IF EXISTS feedback_message_len,
  DROP CONSTRAINT IF EXISTS feedback_page_url_len,
  DROP CONSTRAINT IF EXISTS feedback_user_agent_len;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_first_name_len CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 80),
  ADD CONSTRAINT feedback_last_name_len CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 80),
  ADD CONSTRAINT feedback_email_valid CHECK (char_length(email) <= 254 AND email ~* '^[^@\s]+@[^@\s.]+\.[^@\s]+$'),
  ADD CONSTRAINT feedback_message_len CHECK (char_length(btrim(message)) BETWEEN 1 AND 4000),
  ADD CONSTRAINT feedback_page_url_len CHECK (page_url IS NULL OR char_length(page_url) <= 2048),
  ADD CONSTRAINT feedback_user_agent_len CHECK (user_agent IS NULL OR char_length(user_agent) <= 512);

DROP POLICY IF EXISTS "Anyone can insert feedback" ON public.feedback;
CREATE POLICY "Public can submit feedback"
  ON public.feedback FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins read feedback" ON public.feedback;
CREATE POLICY "Admins read feedback"
  ON public.feedback FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE SELECT ON public.feedback FROM anon;
GRANT SELECT ON public.feedback TO authenticated;

-- 3. session_focus scoped to session participants
DROP POLICY IF EXISTS "Authenticated users can read session focus" ON public.session_focus;
DROP POLICY IF EXISTS "Authenticated users can insert session focus" ON public.session_focus;
DROP POLICY IF EXISTS "Authenticated users can update session focus" ON public.session_focus;

CREATE POLICY "Participants read session focus"
  ON public.session_focus FOR SELECT TO authenticated
  USING (public.is_session_owner(session_id, auth.uid()) OR public.has_session_access(session_id, auth.uid()));

CREATE POLICY "Participants insert session focus"
  ON public.session_focus FOR INSERT TO authenticated
  WITH CHECK (public.is_session_owner(session_id, auth.uid()) OR public.has_session_access(session_id, auth.uid()));

CREATE POLICY "Participants update session focus"
  ON public.session_focus FOR UPDATE TO authenticated
  USING (public.is_session_owner(session_id, auth.uid()) OR public.has_session_access(session_id, auth.uid()))
  WITH CHECK (public.is_session_owner(session_id, auth.uid()) OR public.has_session_access(session_id, auth.uid()));

-- 4. Remove anon discoverability / execute rights
REVOKE ALL ON public.sessions, public.profiles, public.shared_session_access,
  public.address_book, public.ui_preferences, public.session_timeline_entries,
  public.session_focus, public.user_roles FROM anon;

REVOKE ALL ON FUNCTION public.is_session_owner(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_session_access(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_session_owner(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_session_access(text, uuid) TO authenticated, service_role;
