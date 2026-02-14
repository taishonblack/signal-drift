
-- Table to store the current focused feed per session
CREATE TABLE public.session_focus (
  session_id TEXT NOT NULL PRIMARY KEY,
  focused_input_id TEXT NOT NULL,
  focused_by TEXT NOT NULL DEFAULT 'Anonymous',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow anyone to read/write (no auth yet — sessions are pin-protected)
ALTER TABLE public.session_focus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read session focus"
  ON public.session_focus FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert session focus"
  ON public.session_focus FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update session focus"
  ON public.session_focus FOR UPDATE
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_focus;
