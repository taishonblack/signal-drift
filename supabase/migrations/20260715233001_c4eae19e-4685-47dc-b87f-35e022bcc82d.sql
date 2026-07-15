
-- FEEDBACK: revoke read access, keep public insert
REVOKE SELECT ON public.feedback FROM anon, authenticated;
-- Ensure insert grant remains for anonymous submissions
GRANT INSERT ON public.feedback TO anon, authenticated;
GRANT ALL ON public.feedback TO service_role;

-- SESSION_FOCUS: restrict to authenticated users
DROP POLICY IF EXISTS "Anyone can insert session focus" ON public.session_focus;
DROP POLICY IF EXISTS "Anyone can read session focus" ON public.session_focus;
DROP POLICY IF EXISTS "Anyone can update session focus" ON public.session_focus;

REVOKE ALL ON public.session_focus FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.session_focus TO authenticated;
GRANT ALL ON public.session_focus TO service_role;

CREATE POLICY "Authenticated users can read session focus"
  ON public.session_focus FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert session focus"
  ON public.session_focus FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update session focus"
  ON public.session_focus FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
