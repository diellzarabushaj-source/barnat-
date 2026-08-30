-- DRx Phase 9A: personal entity storage foundation.
-- Adds substance/variant/product favorites and polymorphic notes while
-- preserving legacy drug rows and owner-only RLS.

alter table public.user_favorites
  drop constraint if exists user_favorites_entity_type_check;

alter table public.user_favorites
  add constraint user_favorites_entity_type_check
  check (entity_type in ('drug','substance','variant','product','lab','icd','protocol'));

drop policy if exists user_favorites_select_own_drugs on public.user_favorites;
drop policy if exists user_favorites_insert_own_drugs on public.user_favorites;
drop policy if exists user_favorites_update_own_drugs on public.user_favorites;
drop policy if exists user_favorites_delete_own_drugs on public.user_favorites;

create policy user_favorites_select_own_clinical
on public.user_favorites
for select to authenticated
using (
  entity_type in ('drug','substance','variant','product')
  and user_id=(select auth.uid())
  and (select private.is_active_user())
);

create policy user_favorites_insert_own_clinical
on public.user_favorites
for insert to authenticated
with check (
  entity_type in ('drug','substance','variant','product')
  and user_id=(select auth.uid())
  and (select private.is_active_user())
);

create policy user_favorites_update_own_clinical
on public.user_favorites
for update to authenticated
using (
  entity_type in ('drug','substance','variant','product')
  and user_id=(select auth.uid())
  and (select private.is_active_user())
)
with check (
  entity_type in ('drug','substance','variant','product')
  and user_id=(select auth.uid())
  and (select private.is_active_user())
);

create policy user_favorites_delete_own_clinical
on public.user_favorites
for delete to authenticated
using (
  entity_type in ('drug','substance','variant','product')
  and user_id=(select auth.uid())
  and (select private.is_active_user())
);

alter table public.user_notes
  add column if not exists entity_type text,
  add column if not exists entity_key text;

update public.user_notes
set entity_type='drug',
    entity_key=drug_id::text
where entity_type is null or entity_key is null;

alter table public.user_notes
  alter column entity_type set default 'drug',
  alter column entity_type set not null,
  alter column entity_key set not null,
  alter column drug_id drop not null;

alter table public.user_notes
  drop constraint if exists user_notes_entity_type_check,
  drop constraint if exists user_notes_entity_key_length,
  drop constraint if exists user_notes_entity_coherence_check;

alter table public.user_notes
  add constraint user_notes_entity_type_check
    check (entity_type in ('drug','substance','variant','product')),
  add constraint user_notes_entity_key_length
    check (char_length(entity_key) between 1 and 300),
  add constraint user_notes_entity_coherence_check
    check (
      (entity_type='drug' and drug_id is not null and entity_key=drug_id::text)
      or
      (entity_type in ('substance','variant','product') and drug_id is null)
    );

create unique index if not exists user_notes_user_entity_unique_idx
  on public.user_notes(user_id,entity_type,entity_key);

create index if not exists user_favorites_user_clinical_live_idx
  on public.user_favorites(user_id,entity_type,updated_at desc)
  where deleted_at is null
    and entity_type in ('drug','substance','variant','product');

create index if not exists user_notes_user_entity_live_idx
  on public.user_notes(user_id,entity_type,updated_at desc)
  where deleted_at is null;
