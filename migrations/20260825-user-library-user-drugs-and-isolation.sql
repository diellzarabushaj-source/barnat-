-- MedIndex personal library hardening — 2026-08-25
--
-- `lib/user-library.js` always reads prescriptions, favorites/notes and personal
-- drugs in the same snapshot. Production therefore needs all three tables to
-- exist and to use the same server-authorized RLS boundary.
--
-- This migration is intentionally additive and idempotent. It does not change
-- ownership of existing rows and it does not copy personal data between users.

CREATE TABLE IF NOT EXISTS public.user_drugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.medindex_users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_drugs_user_client_unique UNIQUE (user_id, client_id),
  CONSTRAINT user_drugs_client_id_length CHECK (char_length(client_id) BETWEEN 1 AND 160),
  CONSTRAINT user_drugs_name_length CHECK (char_length(name) BETWEEN 1 AND 300),
  CONSTRAINT user_drugs_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS user_drugs_user_updated_idx
  ON public.user_drugs (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_drugs_user_active_idx
  ON public.user_drugs (user_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.user_drugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_drugs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medindex_vercel_access ON public.user_drugs;
CREATE POLICY medindex_vercel_access ON public.user_drugs
  FOR ALL TO authenticated
  USING (medindex_vercel_authorized())
  WITH CHECK (medindex_vercel_authorized());

DROP POLICY IF EXISTS medindex_vercel_access_anonymous ON public.user_drugs;
CREATE POLICY medindex_vercel_access_anonymous ON public.user_drugs
  FOR ALL TO anonymous
  USING (medindex_vercel_authorized())
  WITH CHECK (medindex_vercel_authorized());
