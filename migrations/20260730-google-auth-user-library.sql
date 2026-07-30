-- Applied through the audited Neon migration workflow.
-- Persistent users, encrypted prescription envelopes and favorites.

CREATE TABLE IF NOT EXISTS public.medindex_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub text UNIQUE,
  email text NOT NULL UNIQUE,
  display_name text,
  picture_url text,
  role text NOT NULL DEFAULT 'user',
  enabled boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medindex_users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT medindex_users_role_check CHECK (role IN ('editor','user'))
);

CREATE TABLE IF NOT EXISTS public.user_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.medindex_users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  name text,
  diagnosis text,
  payload jsonb NOT NULL,
  client_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_prescriptions_client_id_length CHECK (char_length(client_id) BETWEEN 1 AND 160),
  CONSTRAINT user_prescriptions_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT user_prescriptions_user_client_unique UNIQUE (user_id, client_id)
);

CREATE TABLE IF NOT EXISTS public.user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.medindex_users(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'drug',
  entity_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_favorites_entity_type_check CHECK (entity_type IN ('drug','lab','icd','protocol')),
  CONSTRAINT user_favorites_entity_key_length CHECK (char_length(entity_key) BETWEEN 1 AND 300),
  CONSTRAINT user_favorites_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT user_favorites_user_entity_unique UNIQUE (user_id, entity_type, entity_key)
);

CREATE INDEX IF NOT EXISTS user_prescriptions_user_updated_idx
  ON public.user_prescriptions (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS user_favorites_user_updated_idx
  ON public.user_favorites (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.medindex_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medindex_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_prescriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medindex_vercel_access ON public.medindex_users;
CREATE POLICY medindex_vercel_access ON public.medindex_users
  FOR ALL TO authenticated
  USING (medindex_vercel_authorized())
  WITH CHECK (medindex_vercel_authorized());
DROP POLICY IF EXISTS medindex_vercel_access_anonymous ON public.medindex_users;
CREATE POLICY medindex_vercel_access_anonymous ON public.medindex_users
  FOR ALL TO anonymous
  USING (medindex_vercel_authorized())
  WITH CHECK (medindex_vercel_authorized());

DROP POLICY IF EXISTS medindex_vercel_access ON public.user_prescriptions;
CREATE POLICY medindex_vercel_access ON public.user_prescriptions
  FOR ALL TO authenticated
  USING (medindex_vercel_authorized())
  WITH CHECK (medindex_vercel_authorized());
DROP POLICY IF EXISTS medindex_vercel_access_anonymous ON public.user_prescriptions;
CREATE POLICY medindex_vercel_access_anonymous ON public.user_prescriptions
  FOR ALL TO anonymous
  USING (medindex_vercel_authorized())
  WITH CHECK (medindex_vercel_authorized());

DROP POLICY IF EXISTS medindex_vercel_access ON public.user_favorites;
CREATE POLICY medindex_vercel_access ON public.user_favorites
  FOR ALL TO authenticated
  USING (medindex_vercel_authorized())
  WITH CHECK (medindex_vercel_authorized());
DROP POLICY IF EXISTS medindex_vercel_access_anonymous ON public.user_favorites;
CREATE POLICY medindex_vercel_access_anonymous ON public.user_favorites
  FOR ALL TO anonymous
  USING (medindex_vercel_authorized())
  WITH CHECK (medindex_vercel_authorized());

INSERT INTO public.medindex_users (email, display_name, role, enabled, updated_at)
VALUES ('diellzarabushaj@gmail.com', 'Diellza Rabushaj', 'editor', true, now())
ON CONFLICT (email) DO UPDATE SET role='editor', enabled=true, display_name=EXCLUDED.display_name, updated_at=now();
