
-- Session Timeline entries (Phase 1A)

CREATE TABLE public.session_timeline_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  author_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_type TEXT NOT NULL DEFAULT 'operator' CHECK (author_type IN ('operator','quinn','system')),
  source_id TEXT NULL,
  source_name TEXT NULL,
  entry_type TEXT NOT NULL DEFAULT 'comment'
    CHECK (entry_type IN ('comment','warning','critical','information','marker','configuration_change','session_event')),
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'note'
    CHECK (severity IN ('note','information','warning','critical')),
  parent_id UUID NULL REFERENCES public.session_timeline_entries(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'informational'
    CHECK (status IN ('open','resolved','informational')),
  resolved_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by_name TEXT NULL,
  resolved_at TIMESTAMPTZ NULL,
  quinn_confidence NUMERIC NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  edited_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX session_timeline_entries_session_created_idx
  ON public.session_timeline_entries (session_id, created_at);
CREATE INDEX session_timeline_entries_parent_idx
  ON public.session_timeline_entries (parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_timeline_entries TO authenticated;
GRANT ALL ON public.session_timeline_entries TO service_role;

ALTER TABLE public.session_timeline_entries ENABLE ROW LEVEL SECURITY;

-- Read: session owner or anyone with shared access
CREATE POLICY "Timeline: read by session participants"
  ON public.session_timeline_entries
  FOR SELECT
  TO authenticated
  USING (
    public.is_session_owner(session_id, auth.uid())
    OR public.has_session_access(session_id, auth.uid())
  );

-- Insert: any authenticated participant, must be author of the row
CREATE POLICY "Timeline: participants insert own entries"
  ON public.session_timeline_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.is_session_owner(session_id, auth.uid())
      OR public.has_session_access(session_id, auth.uid())
    )
  );

-- Update: authors can edit their own entries; owner can update any (e.g., resolve)
CREATE POLICY "Timeline: author or owner updates"
  ON public.session_timeline_entries
  FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR public.is_session_owner(session_id, auth.uid())
  )
  WITH CHECK (
    author_id = auth.uid()
    OR public.is_session_owner(session_id, auth.uid())
  );

-- Delete: authors delete own; owner deletes any
CREATE POLICY "Timeline: author or owner deletes"
  ON public.session_timeline_entries
  FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR public.is_session_owner(session_id, auth.uid())
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_timeline_entries;
