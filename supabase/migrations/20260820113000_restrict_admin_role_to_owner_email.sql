-- Administration belongs to a named address.
--
-- `profiles.role = 'admin'` was enough to reach every admin surface, which meant
-- one edited row — by any route that reaches the table — granted approval rights
-- over every account in MedIndex. The application now checks the address too;
-- this is the same rule at the level that cannot be bypassed by reaching the
-- database directly.

create or replace function private.admin_emails()
returns text[]
language sql
stable
set search_path = ''
as $$
  select array['diellzarabushaj@gmail.com']::text[];
$$;

revoke all on function private.admin_emails() from public, anon, authenticated;

create or replace function private.enforce_admin_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if new.role <> 'admin' then
    return new;
  end if;

  select lower(btrim(u.email)) into v_email
    from auth.users u
   where u.id = new.id;

  if v_email is null or not (v_email = any (private.admin_emails())) then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_EMAIL_NOT_ALLOWED';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_admin_email() from public, anon, authenticated;

drop trigger if exists profiles_restrict_admin_role on public.profiles;
create trigger profiles_restrict_admin_role
before insert or update of role on public.profiles
for each row
execute function private.enforce_admin_email();
