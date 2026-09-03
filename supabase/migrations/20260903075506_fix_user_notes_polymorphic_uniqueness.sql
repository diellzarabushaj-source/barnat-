-- Phase 9 made user_notes polymorphic and introduced the canonical
-- (user_id, entity_type, entity_key) unique index. The original native-note
-- UNIQUE (user_id, drug_id) constraint became obsolete and can reject a valid
-- product note when the same product also has a legacy drug note.

alter table public.user_notes
  drop constraint if exists user_notes_user_id_drug_id_key;
