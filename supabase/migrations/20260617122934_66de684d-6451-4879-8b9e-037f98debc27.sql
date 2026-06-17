
-- Items: documents and folders
CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('doc','folder')),
  name TEXT NOT NULL DEFAULT 'Untitled',
  parent_id UUID REFERENCES public.items(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#94a3b8',
  starred BOOLEAN NOT NULL DEFAULT false,
  position DOUBLE PRECISION NOT NULL DEFAULT extract(epoch from now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX items_user_parent_idx ON public.items(user_id, parent_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own items" ON public.items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Views
CREATE TABLE public.views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position DOUBLE PRECISION NOT NULL DEFAULT extract(epoch from now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX views_user_idx ON public.views(user_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.views TO authenticated;
GRANT ALL ON public.views TO service_role;
ALTER TABLE public.views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own views" ON public.views
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- View items (link table)
CREATE TABLE public.view_items (
  view_id UUID NOT NULL REFERENCES public.views(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position DOUBLE PRECISION NOT NULL DEFAULT extract(epoch from now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (view_id, item_id)
);
CREATE INDEX view_items_view_idx ON public.view_items(view_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.view_items TO authenticated;
GRANT ALL ON public.view_items TO service_role;
ALTER TABLE public.view_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own view_items" ON public.view_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER items_set_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
