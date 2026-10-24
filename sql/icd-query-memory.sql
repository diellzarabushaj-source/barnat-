-- Additive terminology memory only. Never writes the ICD hierarchy or titles.
create function public.icd_normalize_query_v1(p_expression text) returns text
language sql immutable strict security invoker set search_path=pg_catalog
as $$ select btrim(regexp_replace(regexp_replace(normalize(lower(btrim(p_expression)),NFD),U&'[\0300-\036F]','','g'),'[^a-z0-9]+',' ','g')) $$;

create table public.icd_query_memory_v1 (
 id uuid primary key default gen_random_uuid(),
 classification text not null default 'ICD-10-WHO 2019' check(classification='ICD-10-WHO 2019'),
 expression text not null check(length(expression) between 3 and 80 and expression !~ '[0-9@<>:/]' and expression !~ E'[\n\r]'),
 expression_norm text generated always as (public.icd_normalize_query_v1(expression)) stored,
 code text not null check(code ~ '^[A-Z][0-9]{2}(\.[0-9]{1,2})?$'),
 kind text not null check(kind in ('alias','latin')),
 scope text not null check(scope in ('global','personal')),
 status text not null check(status in ('pending','verified','rejected','personal')),
 owner_id uuid,
 owner_key uuid generated always as (coalesce(owner_id,'00000000-0000-0000-0000-000000000000'::uuid)) stored,
 submitted_by uuid not null,
 source text not null check(source in ('user','ai')),
 reviewer_id uuid,
 reviewed_at timestamptz,
 evidence_url text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((scope='personal' and owner_id=submitted_by and status='personal' and kind='alias') or (scope='global' and owner_id is null and status in ('pending','verified','rejected'))),
 check(status<>'verified' or (reviewer_id is not null and reviewed_at is not null and evidence_url ~ '^https://[^[:space:]]+$')),
 unique(classification,scope,owner_key,expression_norm,code,kind)
);
create index icd_memory_read_v1 on public.icd_query_memory_v1(classification,scope,status,owner_id,id);
create index icd_memory_pending_v1 on public.icd_query_memory_v1(expression_norm,submitted_by) where status='pending';

create table public.icd_query_memory_audit_v1 (
 id bigint generated always as identity primary key,
 memory_id uuid not null references public.icd_query_memory_v1(id),
 actor_id uuid not null,
 old_status text,
 new_status text not null,
 evidence_url text not null default '',
 occurred_at timestamptz not null default now()
);
create function public.icd_audit_query_memory_v1() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public
as $$ begin
 insert into public.icd_query_memory_audit_v1(memory_id,actor_id,old_status,new_status,evidence_url)
 values(new.id,coalesce(new.reviewer_id,new.submitted_by),case when tg_op='UPDATE' then old.status else null end,new.status,new.evidence_url);
 return new;
end $$;
create trigger icd_memory_audit after insert or update on public.icd_query_memory_v1
for each row execute function public.icd_audit_query_memory_v1();

alter table public.icd_query_memory_v1 enable row level security;
alter table public.icd_query_memory_audit_v1 enable row level security;
revoke all on public.icd_query_memory_v1,public.icd_query_memory_audit_v1 from public,anon,authenticated,service_role;
revoke all on sequence public.icd_query_memory_audit_v1_id_seq from public,anon,authenticated,service_role;
-- The signed application session is verified by the existing server; no browser
-- role gets a direct table write, approval, deletion or TRUNCATE path.
grant select,insert,update on public.icd_query_memory_v1 to service_role;
grant select,insert on public.icd_query_memory_audit_v1 to service_role;
grant usage,select on sequence public.icd_query_memory_audit_v1_id_seq to service_role;
create policy memory_server on public.icd_query_memory_v1 to service_role using(true) with check(true);
create policy memory_audit_server on public.icd_query_memory_audit_v1 to service_role using(true) with check(true);

create function public.icd_submit_query_memory_v1(p_expression text,p_code text,p_kind text,p_scope text,p_actor uuid,p_source text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$ declare v_id uuid; v_status text; v_duplicate boolean:=false; begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'Active profile required' using errcode='42501'; end if;
 if p_expression is null or length(p_expression) not between 3 and 80 or p_expression ~ '[0-9@<>:/]' or p_expression ~ E'[\n\r]' then raise exception 'Medical expression only'; end if;
 if not exists(select 1 from public.icd_hierarchy_active where code=p_code and level_name in ('category','subcategory')) then raise exception 'Unknown canonical ICD code'; end if;
 if p_kind='latin' and exists(select 1 from public.icd_hierarchy_active where code=p_code and nullif(btrim(title_la),'') is not null) then raise exception 'Existing Latin title is immutable'; end if;
 insert into public.icd_query_memory_v1(expression,code,kind,scope,status,owner_id,submitted_by,source)
 values(public.icd_normalize_query_v1(p_expression),p_code,p_kind,p_scope,case when p_scope='personal' then 'personal' else 'pending' end,case when p_scope='personal' then p_actor else null end,p_actor,p_source)
 on conflict(classification,scope,owner_key,expression_norm,code,kind) do nothing returning id,status into v_id,v_status;
 if v_id is null then
  v_duplicate:=true;
  select id,status into v_id,v_status from public.icd_query_memory_v1 where classification='ICD-10-WHO 2019' and scope=p_scope and owner_key=coalesce(case when p_scope='personal' then p_actor else null end,'00000000-0000-0000-0000-000000000000'::uuid) and expression_norm=public.icd_normalize_query_v1(p_expression) and code=p_code and kind=p_kind;
 end if;
 return jsonb_build_object('id',v_id,'duplicate',v_duplicate,'status',v_status);
end $$;

create function public.icd_review_query_memory_v1(p_id uuid,p_status text,p_actor uuid,p_evidence_url text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$ declare v_row public.icd_query_memory_v1; begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active' and role='admin') then raise exception 'Live administrator required' using errcode='42501'; end if;
 if p_status not in ('verified','rejected') then raise exception 'Invalid review'; end if;
 select * into v_row from public.icd_query_memory_v1 where id=p_id and scope='global' for update;
 if not found then raise exception 'Proposal missing'; end if;
 if p_status='verified' and not exists(select 1 from public.icd_hierarchy_active where code=v_row.code and level_name in ('category','subcategory')) then raise exception 'Unknown canonical ICD code'; end if;
 if p_status='verified' and v_row.kind='latin' and exists(select 1 from public.icd_hierarchy_active where code=v_row.code and nullif(btrim(title_la),'') is not null) then raise exception 'Existing Latin title is immutable'; end if;
 update public.icd_query_memory_v1 set status=p_status,reviewer_id=p_actor,reviewed_at=now(),evidence_url=case when p_status='rejected' and coalesce(p_evidence_url,'')='' then evidence_url else p_evidence_url end,updated_at=now() where id=p_id;
 return jsonb_build_object('id',p_id,'status',p_status);
end $$;

revoke all on function public.icd_submit_query_memory_v1(text,text,text,text,uuid,text),public.icd_review_query_memory_v1(uuid,text,uuid,text),public.icd_audit_query_memory_v1() from public,anon,authenticated;
grant execute on function public.icd_submit_query_memory_v1(text,text,text,text,uuid,text),public.icd_review_query_memory_v1(uuid,text,uuid,text),public.icd_audit_query_memory_v1() to service_role;
