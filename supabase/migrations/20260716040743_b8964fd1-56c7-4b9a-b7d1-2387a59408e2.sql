
-- ─── Extensions ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── Shared updated_at trigger ─────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── Profiles ──────────────────────────────────────────────
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'operator'
               CHECK (role IN ('account_owner', 'operator')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Sessions (table only; policies later) ───────────────────
CREATE TABLE public.sessions (
  id          TEXT PRIMARY KEY,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL
              CHECK (status IN ('draft','scheduled','active','paused','completed','archived')),
  pin_hash    TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_owner_idx  ON public.sessions(owner_id);
CREATE INDEX sessions_status_idx ON public.sessions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Shared session access (table only; policies later) ──────
CREATE TABLE public.shared_session_access (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        TEXT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              TEXT NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('owner','viewer')),
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at  TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX ssa_session_idx ON public.shared_session_access(session_id);
CREATE INDEX ssa_user_idx    ON public.shared_session_access(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_session_access TO authenticated;
GRANT ALL ON public.shared_session_access TO service_role;

ALTER TABLE public.shared_session_access ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER ssa_updated_at
  BEFORE UPDATE ON public.shared_session_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Auto-create profile on signup ──────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1),
      'Operator'
    ),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operator')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Security-definer access helpers (tables now exist) ─────
CREATE OR REPLACE FUNCTION public.has_session_access(_session_id TEXT, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_session_access
    WHERE session_id = _session_id
      AND user_id    = _user_id
      AND revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_session_owner(_session_id TEXT, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = _session_id AND owner_id = _user_id
  );
$$;

-- ─── Sessions policies ──────────────────────────────────────
CREATE POLICY "Owner reads own sessions"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Shared viewer reads session"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (public.has_session_access(id, auth.uid()));

CREATE POLICY "Owner inserts own session"
  ON public.sessions FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner updates own session"
  ON public.sessions FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner deletes own session"
  ON public.sessions FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ─── Shared-access policies ─────────────────────────────────
CREATE POLICY "Owner reads shares for own sessions"
  ON public.shared_session_access FOR SELECT
  TO authenticated
  USING (public.is_session_owner(session_id, auth.uid()));

CREATE POLICY "Viewer reads own grants"
  ON public.shared_session_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owner inserts shares for own sessions"
  ON public.shared_session_access FOR INSERT
  TO authenticated
  WITH CHECK (public.is_session_owner(session_id, auth.uid()));

CREATE POLICY "Owner updates shares for own sessions"
  ON public.shared_session_access FOR UPDATE
  TO authenticated
  USING (public.is_session_owner(session_id, auth.uid()))
  WITH CHECK (public.is_session_owner(session_id, auth.uid()));

CREATE POLICY "Viewer updates own last_accessed"
  ON public.shared_session_access FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner deletes shares for own sessions"
  ON public.shared_session_access FOR DELETE
  TO authenticated
  USING (public.is_session_owner(session_id, auth.uid()));

-- ─── PIN helpers (service_role only) ────────────────────────
CREATE OR REPLACE FUNCTION public.hash_session_pin(_pin TEXT)
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.crypt(_pin, extensions.gen_salt('bf', 8));
$$;

CREATE OR REPLACE FUNCTION public.verify_session_pin(_session_id TEXT, _pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored TEXT;
BEGIN
  SELECT pin_hash INTO stored FROM public.sessions WHERE id = _session_id;
  IF stored IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN stored = extensions.crypt(_pin, stored);
END;
$$;

REVOKE ALL ON FUNCTION public.hash_session_pin(TEXT)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_session_pin(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_session_pin(TEXT)         TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_session_pin(TEXT, TEXT) TO service_role;
