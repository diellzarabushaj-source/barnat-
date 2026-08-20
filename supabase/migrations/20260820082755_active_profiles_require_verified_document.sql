-- Existing active accounts predate professional-document verification and are
-- explicitly grandfathered. Every future transition to active must be verified.
update public.profiles
   set verification_status = 'verified',
       verification_reviewed_at = coalesce(verification_reviewed_at, updated_at, now()),
       updated_at = now()
 where status = 'active'
   and verification_status <> 'verified';

create or replace function private.enforce_verified_active_profile()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'active' and new.verification_status <> 'verified' then
    raise exception using
      errcode = 'P0001',
      message = 'PROFESSIONAL_DOCUMENT_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_verified_active_profile() from public;

drop trigger if exists profiles_require_verified_document_before_active
  on public.profiles;
create trigger profiles_require_verified_document_before_active
before insert or update of status, verification_status on public.profiles
for each row
execute function private.enforce_verified_active_profile();
