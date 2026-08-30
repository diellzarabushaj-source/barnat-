-- Rollback DRx Phase 9A.
-- Refuse destructive rollback after any Phase 9 non-drug personal data exists.

do $$
begin
  if exists (
    select 1 from public.user_favorites
    where entity_type in ('substance','variant','product')
  ) or exists (
    select 1 from public.user_notes
    where entity_type in ('substance','variant','product')
  ) then
    raise exception 'Phase 9A rollback blocked: non-drug personal data exists';
  end if;
end $$;

drop policy if exists user_favorites_select_own_clinical on public.user_favorites;
drop policy if exists user_favorites_insert_own_clinical on public.user_favorites;
drop policy if exists user_favorites_update_own_clinical on public.user_favorites;
drop policy if exists user_favorites_delete_own_clinical on public.user_favorites;

create policy user_favorites_select_own_drugs
on public.user_favorites
for select to authenticated
using (
  entity_type='drug'
  and user_id=(select auth.uid())
  and (select private.is_active_user())
);

create policy user_favorites_insert_own_drugs
on public.user_favorites
for insert to authenticated
with check (
  entity_type='drug'
  and user_id=(select auth.uid())
  and (select private.is_active_user())
);

create policy user_favorites_update_own_drugs
on public.user_favorites
for update to authenticated
using (
  entity_type='drug'
  and user_id=(select auth.uid())
  and (select private.is_active_user())
)
with check (
  entity_type='drug'
  and user_id=(select auth.uid())
  and (select private.is_active_user())
);

create policy user_favorites_delete_own_drugs
on public.user_favorites
for delete to authenticated
using (
  entity_type='drug'
  and user_id=(select auth.uid())
  and (select private.is_active_user())
);

alter table public.user_favorites
  drop constraint if exists user_favorites_entity_type_check;

alter table public.user_favorites
  add constraint user_favorites_entity_type_check
  check (entity_type in ('drug','lab','icd','protocol'));

drop index if exists public.user_favorites_user_clinical_live_idx;
drop index if exists public.user_notes_user_entity_live_idx;
drop index if exists public.user_notes_user_entity_unique_idx;

alter table public.user_notes
  drop constraint if exists user_notes_entity_coherence_check,
  drop constraint if exists user_notes_entity_key_length,
  drop constraint if exists user_notes_entity_type_check;

alter table public.user_notes
  alter column drug_id set not null;

alter table public.user_notes
  drop column if exists entity_key,
  drop column if exists entity_type;
