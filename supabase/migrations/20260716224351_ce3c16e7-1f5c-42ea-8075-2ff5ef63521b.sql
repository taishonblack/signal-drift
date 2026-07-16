CREATE TABLE public.ui_preferences (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_preferences TO authenticated;
GRANT ALL ON public.ui_preferences TO service_role;

ALTER TABLE public.ui_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own UI preferences"
  ON public.ui_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER ui_preferences_set_updated_at
  BEFORE UPDATE ON public.ui_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();