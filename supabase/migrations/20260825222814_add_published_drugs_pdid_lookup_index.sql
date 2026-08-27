-- Synced from Supabase production migration history.
-- version: 20260825222814
-- name: add_published_drugs_pdid_lookup_index

create index if not exists drugs_published_pdid_registry_idx on public.drugs (pdid, registry_number) where is_published = true and editorial_status = 'published';
