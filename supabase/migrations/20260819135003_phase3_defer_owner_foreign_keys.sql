-- Synced from Supabase production migration history.
-- version: 20260819135003
-- name: phase3_defer_owner_foreign_keys

ALTER TABLE public.user_favorites DROP CONSTRAINT IF EXISTS user_favorites_user_id_fkey;
ALTER TABLE public.user_prescriptions DROP CONSTRAINT IF EXISTS user_prescriptions_user_id_fkey;
