create or replace function public.apply_registry_price_update_v1(p_plan jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $fn$
declare
  prior jsonb; before_data jsonb; summary jsonb; affected integer;
  updates jsonb := p_plan->'updates'; additions jsonb := p_plan->'inserts'; missing jsonb := p_plan->'missing';
  allowed text[] := array['retail_price','wholesale_price','wholesale_with_margin','update_status','updated_at'];
begin
  if p_plan->>'schemaVersion' <> '1' or p_plan->>'sourceSha256' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(updates) <> 'array' or jsonb_typeof(additions) <> 'array' or jsonb_typeof(missing) <> 'array'
    or jsonb_array_length(p_plan->'issues') <> 0 then
    raise exception 'Invalid or unresolved import plan';
  end if;
  lock table public.drugs in share row exclusive mode;
  select result into prior from registry_update_private.imports where source_sha256=p_plan->>'sourceSha256';
  if found then return prior || jsonb_build_object('alreadyApplied',true); end if;
  if (select count(*) from public.drugs) <> (p_plan->>'existingCount')::integer then
    raise exception 'Registry changed; regenerate the preview';
  end if;
  if jsonb_array_length(updates)+jsonb_array_length(additions)+jsonb_array_length(p_plan->'duplicates') <> (p_plan->>'incomingCount')::integer then
    raise exception 'Source row reconciliation failed';
  end if;
  if jsonb_array_length(missing)>0 and coalesce((p_plan->>'completeApprovalList')::boolean,false) is not true then
    raise exception 'Absence requires a complete approval list';
  end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_plan->'ignoredIds','[]'::jsonb)) x left join public.drugs d on d.id=x::uuid where d.id is null or d.editorial_status<>'archived') then
    raise exception 'Only archived records may be ignored';
  end if;
  if coalesce((p_plan->>'completeApprovalList')::boolean,false) and jsonb_array_length(updates)+jsonb_array_length(missing)+jsonb_array_length(coalesce(p_plan->'ignoredIds','[]'::jsonb))<>(p_plan->>'existingCount')::integer then
    raise exception 'Existing row reconciliation failed';
  end if;
  if exists(select 1 from (select x->>'id' id from jsonb_array_elements(updates||missing) x) s group by id having count(*)>1)
    or exists(select 1 from jsonb_array_elements(updates||missing) x left join public.drugs d on d.id=(x->>'id')::uuid where d.id is null) then
    raise exception 'Duplicate or unknown existing drug';
  end if;
  if exists(select 1 from jsonb_array_elements(updates) x join public.drugs d on d.id=(x->>'id')::uuid
    where jsonb_build_object('pdid',d.pdid,'registry_number',d.registry_number,'retail_price',d.retail_price,'wholesale_price',d.wholesale_price,'wholesale_with_margin',d.wholesale_with_margin) is distinct from x->'expected') then
    raise exception 'A matched drug changed; regenerate the preview';
  end if;
  if exists(select 1 from jsonb_array_elements(updates) x cross join lateral jsonb_each(x->'prices') v
    where v.key not in ('retail_price','wholesale_price','wholesale_with_margin') or jsonb_typeof(v.value)<>'number' or (v.value::text)::numeric<0)
    or exists(select 1 from jsonb_array_elements(updates) x where not (x->'prices' ?& array['retail_price','wholesale_price','wholesale_with_margin'])) then
    raise exception 'Invalid price';
  end if;
  select jsonb_agg(to_jsonb(d)) into before_data from public.drugs d;
  update public.drugs d set
    retail_price=(x->'prices'->>'retail_price')::numeric,
    wholesale_price=(x->'prices'->>'wholesale_price')::numeric,
    wholesale_with_margin=(x->'prices'->>'wholesale_with_margin')::numeric,
    update_status='Ka qenë',updated_at=now()
  from jsonb_array_elements(updates) x where d.id=(x->>'id')::uuid;
  get diagnostics affected = row_count;
  if affected<>jsonb_array_length(updates) then raise exception 'Update count mismatch'; end if;
  update public.drugs d set update_status='S’është më',updated_at=now()
  from jsonb_array_elements(missing) x where d.id=(x->>'id')::uuid;
  insert into public.drugs(id,registry_number,pdid,protocol_no,trade_name,active_substance,atc_code,strength,pharmaceutical_form,packaging,marketing_authorization_holder,manufacturer,ma_certificate,product_status,wholesale_price,wholesale_with_margin,vat_text,retail_price,validity_text,source_payload,editorial_status,is_published,update_status,pediatric_verification_status)
  select (x->>'id')::uuid,(x->>'registry_number')::integer,x->>'pdid',x->>'protocol_no',x->>'trade_name',x->>'active_substance',x->>'atc_code',x->>'strength',x->>'pharmaceutical_form',x->>'packaging',x->>'marketing_authorization_holder',x->>'manufacturer',x->>'ma_certificate',x->>'product_status',(x->>'wholesale_price')::numeric,(x->>'wholesale_with_margin')::numeric,x->>'vat_text',(x->>'retail_price')::numeric,x->>'validity_text',x,'in_review',false,'E re','needs_source'
  from jsonb_array_elements(additions) x;
  if exists(select 1 from jsonb_array_elements(before_data) old join public.drugs d on d.id=(old->>'id')::uuid where old-allowed is distinct from to_jsonb(d)-allowed) then
    raise exception 'Protected existing data changed; entire import rolled back';
  end if;
  summary := jsonb_build_object('matched',jsonb_array_length(updates),'new',jsonb_array_length(additions),'missing',jsonb_array_length(missing),'priceChanged',p_plan->'summary'->'priceChanged','clinicalDataPreserved',true,'sourceSha256',p_plan->>'sourceSha256');
  insert into registry_update_private.imports(source_sha256,plan,before_rows,result) values(p_plan->>'sourceSha256',p_plan,before_data,summary);
  return summary;
end;
$fn$;
revoke execute on function public.apply_registry_price_update_v1(jsonb) from public,anon,authenticated;
grant execute on function public.apply_registry_price_update_v1(jsonb) to service_role;


create policy service_role_imports on registry_update_private.imports to service_role using (true) with check (true);
