create table if not exists registry_update_private.clinical_review_queue (
 source_sha256 text not null references registry_update_private.imports(source_sha256),
 drug_id uuid not null references public.drugs(id),
 status text not null check(status in ('needs_source','needs_product_review','in_review','reviewed')),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (source_sha256, drug_id)
);
alter table registry_update_private.clinical_review_queue enable row level security;
revoke all on registry_update_private.clinical_review_queue from public, anon, authenticated;
grant select, insert, update on registry_update_private.clinical_review_queue to service_role;
create policy clinical_review_service_only on registry_update_private.clinical_review_queue
 for all to service_role using (true) with check (true);
create or replace function public.stage_registry_clinical_review_v1(p_queue jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
 v_sha text := p_queue->>'sourceSha256';
 v_count integer;
 v_import jsonb;
 v_entry jsonb;
 v_id uuid;
 v_touched integer := 0;
begin
 if p_queue->>'schemaVersion' <> 'registry-clinical-review-v1'
 or v_sha is null or v_sha !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(p_queue->'entries') is distinct from 'array' then
  raise exception 'Invalid clinical review payload';
 end if;
 select i.plan into v_import from registry_update_private.imports i where i.source_sha256=v_sha;
 if v_import is null then raise exception 'Registry import does not exist'; end if;
 v_count := jsonb_array_length(p_queue->'entries');
 if v_count=0 or v_count>5000 then raise exception 'Invalid clinical queue size'; end if;
 if (select count(distinct x->>'drugId') from jsonb_array_elements(p_queue->'entries') x)<>v_count then
  raise exception 'Duplicate clinical target';
 end if;
 for v_entry in select x from jsonb_array_elements(p_queue->'entries') x loop
  v_id := (v_entry->>'drugId')::uuid;
  if v_entry->>'status' not in ('needs_source','needs_product_review')
   or v_entry->>'publicationAllowed' is distinct from 'false'
   or jsonb_typeof(v_entry->'sources') is distinct from 'array'
   or jsonb_typeof(v_entry->'references') is distinct from 'array' then
   raise exception 'Invalid clinical entry';
  end if;
  if not exists(select 1 from jsonb_array_elements(v_import->'inserts') x where x->>'id'=v_id::text) then
   raise exception 'Target was not inserted by this import';
  end if;
  perform 1 from public.drugs d where d.id=v_id and d.update_status='E re'
   and d.is_published=false and d.editorial_status in ('draft','in_review') for update;
  if not found then raise exception 'Target is no longer an unpublished new medicine'; end if;
  insert into registry_update_private.clinical_review_queue(source_sha256,drug_id,status,payload)
   values(v_sha,v_id,v_entry->>'status',v_entry)
   on conflict(source_sha256,drug_id) do update set status=excluded.status,payload=excluded.payload,updated_at=now()
    where clinical_review_queue.status in ('needs_source','needs_product_review');
  if found then v_touched := v_touched+1; end if;
 end loop;
 return jsonb_build_object('queued',v_touched,'products',v_count,'published',0);
end;
$function$;
revoke all on function public.stage_registry_clinical_review_v1(jsonb) from public,anon,authenticated;
grant execute on function public.stage_registry_clinical_review_v1(jsonb) to service_role;
comment on function public.stage_registry_clinical_review_v1(jsonb) is 'Private source and reference proposals for unpublished new medicines. No clinical approval, legacy mutation or publication.';
