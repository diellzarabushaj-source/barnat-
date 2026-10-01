-- Admin-controlled access can be approved without an uploaded document.
-- Existing document review, account-role guards and audit logging are retained.
alter table public.profiles drop constraint profiles_verification_status_check;
alter table public.profiles add constraint profiles_verification_status_check
  check (verification_status in ('missing', 'submitted', 'verified', 'rejected', 'admin_approved'));

create or replace function private.enforce_verified_active_profile()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'active' and new.verification_status not in ('verified', 'admin_approved') then
    raise exception using errcode = 'P0001', message = 'PROFESSIONAL_DOCUMENT_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_verified_active_profile() from public;

create or replace function public.review_medindex_registration(
  p_actor_id uuid,
  p_target_id uuid,
  p_role text,
  p_status text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_document public.verification_documents%rowtype;
  v_storage_id uuid;
  v_verification_status text;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = p_actor_id and p.role = 'admin' and p.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_ADMIN_REQUIRED';
  end if;

  if p_role not in ('doctor', 'admin') then
    raise exception using errcode = 'P0001', message = 'ROLE_INVALID';
  end if;
  if p_status not in ('pending', 'active', 'suspended', 'disabled') then
    raise exception using errcode = 'P0001', message = 'STATUS_INVALID';
  end if;
  if p_rejection_reason is not null and char_length(p_rejection_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'REJECTION_REASON_TOO_LONG';
  end if;

  select * into v_target
    from public.profiles p
   where p.id = p_target_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;

  if v_target.id = p_actor_id
     and v_target.role = 'admin'
     and (p_role <> 'admin' or p_status <> 'active') then
    raise exception using errcode = 'P0001', message = 'SELF_DEMOTION_BLOCKED';
  end if;

  if v_target.role = 'admin'
     and (p_role <> 'admin' or p_status <> 'active')
     and (select count(*) from public.profiles p where p.role = 'admin' and p.status = 'active') <= 1 then
    raise exception using errcode = 'P0001', message = 'LAST_ADMIN_BLOCKED';
  end if;

  v_verification_status := v_target.verification_status;

  if p_status = 'active' and (v_target.status <> 'active' or v_target.verification_status not in ('verified', 'admin_approved')) then
    select * into v_document
      from public.verification_documents d
     where d.user_id = p_target_id
       and d.status in ('uploaded', 'approved')
     order by d.created_at desc
     limit 1
     for update;
    if found then
      update public.verification_documents
         set status = 'approved', rejection_reason = null,
             reviewed_by = p_actor_id, reviewed_at = now(), updated_at = now()
       where id = v_document.id;
      v_verification_status := 'verified';
    else
      -- An explicit administrator decision grants access without inventing
      -- a professional document or marking the document as verified.
      v_verification_status := 'admin_approved';
    end if;
  elsif v_target.status = 'pending' and p_status = 'disabled' then
    update public.verification_documents
       set status = 'rejected', rejection_reason = nullif(btrim(p_rejection_reason), ''),
           reviewed_by = p_actor_id, reviewed_at = now(), updated_at = now()
     where id = (
       select d.id from public.verification_documents d
        where d.user_id = p_target_id and d.status = 'uploaded'
        order by d.created_at desc limit 1
     );
    v_verification_status := 'rejected';
  end if;

  update public.profiles
     set role = p_role,
         status = p_status,
         verification_status = v_verification_status,
         verification_reviewed_at = case
           when p_status = 'active' or (v_target.status = 'pending' and p_status = 'disabled') then now()
           else verification_reviewed_at
         end,
         updated_at = now()
   where id = p_target_id;

  v_storage_id := coalesce(v_target.legacy_user_id, v_target.id);
  update public.medindex_users
     set enabled = p_status = 'active',
         role = case when p_role = 'admin' then 'editor' else 'user' end,
         updated_at = now()
   where id = v_storage_id;

  insert into public.audit_logs (
    entity_type, entity_id, action, old_data, new_data, changed_by, source, changed_at
  ) values (
    'profile',
    p_target_id,
    'admin_user_review',
    jsonb_build_object(
      'role', v_target.role,
      'status', v_target.status,
      'verificationStatus', v_target.verification_status
    ),
    jsonb_build_object(
      'role', p_role,
      'status', p_status,
      'verificationStatus', v_verification_status
    ),
    p_actor_id::text,
    'admin_users',
    now()
  );

  return jsonb_build_object(
    'id', p_target_id,
    'role', p_role,
    'status', p_status,
    'verificationStatus', v_verification_status
  );
end;
$$;

revoke all on function public.review_medindex_registration(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.review_medindex_registration(uuid, uuid, text, text, text)
  to service_role;
