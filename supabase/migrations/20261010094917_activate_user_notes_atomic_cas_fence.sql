-- Phase B: apply only after the deployed API routes every native and legacy
-- note mutation through write_user_notes_cas. Existing SELECT/RLS and all
-- canonical product identity triggers remain in place.
-- Legacy 'drug' identities are coherent already, but fresh live writes must
-- also require a published canonical product. Receipt retries do not write
-- a table row, so remain accepted if a product is unpublished later.
create function note_write_private.validate_live_drug_note_product()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
begin
  if new.entity_type='drug' and new.deleted_at is null then
    if not exists (
      select 1 from public.drugs
      where id=new.drug_id
        and is_published=true
        and editorial_status='published'
    ) then
      raise exception 'Canonical legacy note product is not active' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function note_write_private.validate_live_drug_note_product()
  from public,anon,authenticated,service_role;
create trigger validate_live_legacy_note_product
before insert or update on public.user_notes
for each row execute function note_write_private.validate_live_drug_note_product();

update note_write_private.control set fence_enabled=true where singleton;
revoke insert,update,delete on public.user_notes from public,anon,authenticated;
-- TRUNCATE would bypass row-level note tombstones/version history.
revoke truncate on public.user_notes,public.user_favorites from public,anon,authenticated,service_role;
