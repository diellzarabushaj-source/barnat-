create or replace function public.stage_registry_clinical_drafts_v1(p_batch jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare
 v_sha text := p_batch->>'sourceSha256';
 v_entry jsonb;
 v_queue jsonb;
 v_status text;
 v_id uuid;
 v_drug public.drugs%rowtype;
 v_population text;
 v_text text;
 v_count integer := 0;
begin
 if v_sha is null or v_sha !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(p_batch->'entries') is distinct from 'array'
 or jsonb_array_length(p_batch->'entries') not between 1 and 500
 then raise exception 'Invalid clinical draft batch'; end if;
 if (select count(distinct x->>'drugId') from jsonb_array_elements(p_batch->'entries') x)<>jsonb_array_length(p_batch->'entries')
 then raise exception 'Duplicate clinical draft target'; end if;
 for v_entry in select x from jsonb_array_elements(p_batch->'entries') x loop
  v_id := (v_entry->>'drugId')::uuid;
  select q.payload,q.status into v_queue,v_status from registry_update_private.clinical_review_queue q
   where q.source_sha256=v_sha and q.drug_id=v_id for update;
  if v_queue is null then raise exception 'Target is not queued for this registry import'; end if;
  select d.* into v_drug from public.drugs d where d.id=v_id for update;
  if v_drug.id is null or v_drug.update_status is distinct from 'E re' or v_drug.is_published is distinct from false
   or coalesce(v_drug.editorial_status,'') not in ('draft','in_review')
  then raise exception 'Only unpublished new medicine drafts can be enriched'; end if;
  if v_entry->>'bindingStatus' is distinct from 'product_specific_candidate'
   or v_entry->>'publicationAllowed' is distinct from 'false'
   or v_entry->>'tradeName' is distinct from v_drug.trade_name
   or v_entry->>'strength' is distinct from v_drug.strength
   or v_entry->>'pharmaceuticalForm' is distinct from v_drug.pharmaceutical_form
   or coalesce(v_entry->>'sourceUrl','') !~ '^https://'
   or coalesce(length(v_entry->>'documentDate'),0)=0
   or coalesce(length(v_entry->>'drugClass'),0) not between 1 and 2000
   or coalesce(length(v_entry->>'useText'),0) not between 1 and 12000
   or coalesce(length(v_entry->>'adultDose'),0) not between 1 and 12000
   or coalesce(length(v_entry->>'pediatricDose'),0) not between 1 and 12000
   or coalesce(length(v_entry->>'route'),0) not between 1 and 80
  then raise exception 'Incomplete product-specific clinical proposal'; end if;
  if not exists(select 1 from jsonb_array_elements(v_queue->'sources') s
   where s->>'rawSha256'=v_entry->>'sourceRawSha256'
   and (s->>'url'=v_entry->>'sourceUrl' or s->>'finalUrl'=v_entry->>'sourceUrl')
   and s->'sectionSha256'->>'4.1'=v_entry->'sectionSha256'->>'4.1'
   and s->'sectionSha256'->>'4.2'=v_entry->'sectionSha256'->>'4.2')
  then raise exception 'Archived source evidence does not match'; end if;
  if v_queue->'appliedDraft'=v_entry then continue; end if;
  if v_queue ? 'appliedDraft' or v_status not in ('needs_source','needs_product_review')
   or v_drug.editorial_override is true or v_drug.use_text is not null or v_drug.drug_class is not null
   or exists(select 1 from public.drug_clinical_profiles p where p.drug_id=v_id)
   or exists(select 1 from public.dosage_regimens r where r.drug_id=v_id)
  then raise exception 'Clinical fields were already authored; use the clinical editor'; end if;
  update public.drugs set use_text=v_entry->>'useText',drug_class=v_entry->>'drugClass',updated_at=now() where id=v_id;
  insert into public.drug_clinical_profiles(drug_id,verification_status,clinical_summary,indications_text,
   warnings,renal_adjustment,hepatic_adjustment,administration_notes,editorial_notes,source_urls,editorial_override)
  values(v_id,'in_review',v_entry->>'drugClass',v_entry->>'useText',v_entry->>'warnings',
   v_entry->>'renalAdjustment',v_entry->>'hepaticAdjustment',v_entry->>'administrationNotes',
   'Propozim nga SmPC i produktit; kërkon shqyrtim klinik. Data/versioni: '||(v_entry->>'documentDate'),
   array[v_entry->>'sourceUrl'],false);
  foreach v_population in array array['adult','pediatric'] loop
   v_text := case when v_population='adult' then v_entry->>'adultDose' else v_entry->>'pediatricDose' end;
   insert into public.dosage_regimens(drug_id,source_key,population,dose_text,route,source_url,source_hash,
    active_substance,atc_code,reference_strength,pharmaceutical_form,indication_text,warnings,calculation_status,editorial_status,editorial_override)
   values(v_id,'registry-update:'||v_sha||':'||v_id::text||':'||v_population,v_population,v_text,v_entry->>'route',
    v_entry->>'sourceUrl',v_entry->>'sourceRawSha256',v_drug.active_substance,v_drug.atc_code,v_drug.strength,
    v_drug.pharmaceutical_form,v_entry->>'useText',v_entry->>'warnings','pending','in_review',false);
  end loop;
  update registry_update_private.clinical_review_queue set status='in_review',payload=payload||jsonb_build_object('appliedDraft',v_entry),updated_at=now()
   where source_sha256=v_sha and drug_id=v_id;
  v_count := v_count+1;
 end loop;
 return jsonb_build_object('draftsFilled',v_count,'published',0);
end;
$function$;
revoke all on function public.stage_registry_clinical_drafts_v1(jsonb) from public,anon,authenticated;
grant execute on function public.stage_registry_clinical_drafts_v1(jsonb) to service_role;
comment on function public.stage_registry_clinical_drafts_v1(jsonb) is 'Fill empty clinical fields of new unpublished products from archived product-specific proposals. Always in_review, never publish or enable a dose calculator.';
