
CREATE TABLE public.address_book (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  session_name TEXT,
  purpose TEXT,
  address TEXT NOT NULL,
  port TEXT,
  description TEXT,
  last_used TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.address_book TO authenticated;
GRANT ALL ON public.address_book TO service_role;

ALTER TABLE public.address_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own address book"
  ON public.address_book FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own address book"
  ON public.address_book FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own address book"
  ON public.address_book FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own address book"
  ON public.address_book FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX address_book_user_idx ON public.address_book(user_id, last_used DESC);

CREATE TRIGGER address_book_set_updated_at
  BEFORE UPDATE ON public.address_book
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
