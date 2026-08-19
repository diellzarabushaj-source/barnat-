-- MedIndex Phase 4 safety correction — trusted owner mapping only.
-- Applied to Supabase project ftuchtmolddhhsdcwnqe on 2026-08-19.
-- Personal rows intentionally remain on the legacy UUID until an encryption-aware rekey.

create or replace function private.claim_legacy_owner(
  p_auth_user_id uuid,
  p_expected_email text,
  p_legacy_user_id uuid,
  p_expected_favorites integer,
  p_expected_prescriptions integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_auth_email text;
  v_role text;
  v_status text;
  v_existing_legacy uuid;
  v_legacy_favorites integer;
  v_target_favorites integer;
  v_legacy_prescriptions integer;
  v_target_prescriptions integer;
begin
  if p_auth_user_id is null or p_legacy_user_id is null then
    raise exception using errcode = 'P0001', message = 'PHASE4_ID_REQUIRED';
  end if;

  if nullif(lower(btrim(p_expected_email)), '') is null then
    raise exception using errcode = 'P0001', message = 'PHASE4_EMAIL_REQUIRED';
  end if;

  if p_expected_favorites < 0 or p_expected_prescriptions < 0 then
    raise exception using errcode = 'P0001', message = 'PHASE4_EXPECTED_COUNT_INVALID';
  end if;

  select lower(u.email::text)
    into v_auth_email
  from auth.users u
  where u.id = p_auth_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PHASE4_AUTH_USER_NOT_FOUND';
  end if;

  if v_auth_email is null or v_auth_email <> lower(btrim(p_expected_email)) then
    raise exception using errcode = 'P0001', message = 'PHASE4_AUTH_EMAIL_MISMATCH';
  end if;

  select p.role, p.status, p.legacy_user_id
    into v_role, v_status, v_existing_legacy
  from public.profiles p
  where p.id = p_auth_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PHASE4_PROFILE_NOT_FOUND';
  end if;

  if v_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'PHASE4_PROFILE_NOT_ACTIVE';
  end if;

  if v_existing_legacy is not null and v_existing_legacy <> p_legacy_user_id then
    raise exception using errcode = 'P0001', message = 'PHASE4_PROFILE_ALREADY_MAPPED';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.legacy_user_id = p_legacy_user_id
      and p.id <> p_auth_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'PHASE4_LEGACY_UUID_ALREADY_CLAIMED';
  end if;

  select count(*)::integer into v_legacy_favorites
  from public.user_favorites f
  where f.user_id = p_legacy_user_id;

  select count(*)::integer into v_target_favorites
  from public.user_favorites f
  where f.user_id = p_auth_user_id;

  select count(*)::integer into v_legacy_prescriptions
  from public.user_prescriptions p
  where p.user_id = p_legacy_user_id;

  select count(*)::integer into v_target_prescriptions
  from public.user_prescriptions p
  where p.user_id = p_auth_user_id;

  if v_legacy_favorites <> p_expected_favorites
     or v_legacy_prescriptions <> p_expected_prescriptions then
    raise exception using errcode = 'P0001', message = 'PHASE4_LEGACY_COUNT_MISMATCH';
  end if;

  if v_target_favorites <> 0 or v_target_prescriptions <> 0 then
    raise exception using errcode = 'P0001', message = 'PHASE4_TARGET_NOT_EMPTY';
  end if;

  update public.profiles
  set role = 'admin',
      status = 'active',
      legacy_user_id = p_legacy_user_id
  where id = p_auth_user_id;

  -- Deliberately do not change user_favorites.user_id or user_prescriptions.user_id here.
  -- Prescription encryption AAD includes the legacy user UUID; moving rows without
  -- re-encryption would make ciphertext unreadable. Phase 5 owns the encryption-aware rekey.

  select count(*)::integer into v_legacy_favorites
  from public.user_favorites f
  where f.user_id = p_legacy_user_id;

  select count(*)::integer into v_target_favorites
  from public.user_favorites f
  where f.user_id = p_auth_user_id;

  select count(*)::integer into v_legacy_prescriptions
  from public.user_prescriptions p
  where p.user_id = p_legacy_user_id;

  select count(*)::integer into v_target_prescriptions
  from public.user_prescriptions p
  where p.user_id = p_auth_user_id;

  if v_legacy_favorites <> p_expected_favorites
     or v_legacy_prescriptions <> p_expected_prescriptions
     or v_target_favorites <> 0
     or v_target_prescriptions <> 0 then
    raise exception using errcode = 'P0001', message = 'PHASE4_POST_CLAIM_VERIFICATION_FAILED';
  end if;

  insert into public.audit_logs (
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    changed_by,
    source
  ) values (
    'profile',
    p_auth_user_id,
    'phase4_attach_legacy_owner',
    jsonb_build_object(
      'role', v_role,
      'legacy_user_id', v_existing_legacy,
      'legacy_favorites', p_expected_favorites,
      'legacy_prescriptions', p_expected_prescriptions
    ),
    jsonb_build_object(
      'role', 'admin',
      'legacy_user_id', p_legacy_user_id,
      'legacy_favorites', v_legacy_favorites,
      'legacy_prescriptions', v_legacy_prescriptions,
      'data_moved', false
    ),
    lower(btrim(p_expected_email)),
    'phase4_safe_owner_claim_mapping_only'
  );

  return jsonb_build_object(
    'ok', true,
    'auth_user_id', p_auth_user_id,
    'legacy_user_id', p_legacy_user_id,
    'role', 'admin',
    'mapped_only', true,
    'data_moved', false,
    'legacy_favorites', v_legacy_favorites,
    'legacy_prescriptions', v_legacy_prescriptions,
    'target_favorites', v_target_favorites,
    'target_prescriptions', v_target_prescriptions
  );
end;
$$;

create or replace function private.rollback_legacy_owner_claim(
  p_auth_user_id uuid,
  p_expected_email text,
  p_legacy_user_id uuid,
  p_expected_favorites integer,
  p_expected_prescriptions integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_auth_email text;
  v_role text;
  v_status text;
  v_existing_legacy uuid;
  v_legacy_favorites integer;
  v_target_favorites integer;
  v_legacy_prescriptions integer;
  v_target_prescriptions integer;
begin
  if p_auth_user_id is null or p_legacy_user_id is null then
    raise exception using errcode = 'P0001', message = 'PHASE4_ID_REQUIRED';
  end if;

  if nullif(lower(btrim(p_expected_email)), '') is null then
    raise exception using errcode = 'P0001', message = 'PHASE4_EMAIL_REQUIRED';
  end if;

  select lower(u.email::text)
    into v_auth_email
  from auth.users u
  where u.id = p_auth_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PHASE4_AUTH_USER_NOT_FOUND';
  end if;

  if v_auth_email is null or v_auth_email <> lower(btrim(p_expected_email)) then
    raise exception using errcode = 'P0001', message = 'PHASE4_AUTH_EMAIL_MISMATCH';
  end if;

  select p.role, p.status, p.legacy_user_id
    into v_role, v_status, v_existing_legacy
  from public.profiles p
  where p.id = p_auth_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PHASE4_PROFILE_NOT_FOUND';
  end if;

  if v_status <> 'active' or v_role <> 'admin' or v_existing_legacy <> p_legacy_user_id then
    raise exception using errcode = 'P0001', message = 'PHASE4_ROLLBACK_PROFILE_STATE_MISMATCH';
  end if;

  select count(*)::integer into v_legacy_favorites
  from public.user_favorites f
  where f.user_id = p_legacy_user_id;

  select count(*)::integer into v_target_favorites
  from public.user_favorites f
  where f.user_id = p_auth_user_id;

  select count(*)::integer into v_legacy_prescriptions
  from public.user_prescriptions p
  where p.user_id = p_legacy_user_id;

  select count(*)::integer into v_target_prescriptions
  from public.user_prescriptions p
  where p.user_id = p_auth_user_id;

  if v_legacy_favorites <> p_expected_favorites
     or v_legacy_prescriptions <> p_expected_prescriptions
     or v_target_favorites <> 0
     or v_target_prescriptions <> 0 then
    raise exception using errcode = 'P0001', message = 'PHASE4_ROLLBACK_COUNT_MISMATCH';
  end if;

  update public.profiles
  set role = 'doctor',
      legacy_user_id = null
  where id = p_auth_user_id;

  insert into public.audit_logs (
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    changed_by,
    source
  ) values (
    'profile',
    p_auth_user_id,
    'phase4_rollback_legacy_owner_mapping',
    jsonb_build_object(
      'role', v_role,
      'legacy_user_id', p_legacy_user_id,
      'legacy_favorites', v_legacy_favorites,
      'legacy_prescriptions', v_legacy_prescriptions
    ),
    jsonb_build_object(
      'role', 'doctor',
      'legacy_user_id', null,
      'data_moved', false
    ),
    lower(btrim(p_expected_email)),
    'phase4_safe_owner_claim_mapping_only'
  );

  return jsonb_build_object(
    'ok', true,
    'rolled_back', true,
    'data_moved', false,
    'auth_user_id', p_auth_user_id,
    'legacy_user_id', p_legacy_user_id,
    'role', 'doctor',
    'legacy_favorites', v_legacy_favorites,
    'legacy_prescriptions', v_legacy_prescriptions
  );
end;
$$;

revoke execute on function private.claim_legacy_owner(uuid, text, uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function private.rollback_legacy_owner_claim(uuid, text, uuid, integer, integer)
  from public, anon, authenticated;

comment on function private.claim_legacy_owner(uuid, text, uuid, integer, integer) is
  'Trusted Phase 4 mapping-only helper. Promotes a verified Auth user to admin and attaches the legacy UUID after exact count checks. It never moves personal rows; encryption-aware rekey belongs to Phase 5.';

comment on function private.rollback_legacy_owner_claim(uuid, text, uuid, integer, integer) is
  'Trusted Phase 4 rollback helper. Clears the mapping/admin promotion only when exact legacy/target counts prove no personal rows moved.';
