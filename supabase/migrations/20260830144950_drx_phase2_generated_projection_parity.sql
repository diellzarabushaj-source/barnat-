-- DRx strict Phase 2: separate durable reconstruction parity from PostgreSQL
-- GENERATED ALWAYS projections. Generated search columns are verified
-- independently from their declared expressions.

create or replace view drx_raw.registry_reconstruction_diff_v1 as
select
  e.source_drug_id,
  e.raw_row_id,
  (
    (to_jsonb(d) - 'updated_at' - 'active_substance_key' - 'global_search_text' - 'registry_search_text')
    is distinct from
    (e.reconstructed_drug_payload - 'active_substance_key' - 'global_search_text' - 'registry_search_text')
  ) as differs,
  encode(digest(convert_to((to_jsonb(d) - 'updated_at' - 'active_substance_key' - 'global_search_text' - 'registry_search_text')::text,'UTF8'),'sha256'),'hex') as current_sha256,
  encode(digest(convert_to((e.reconstructed_drug_payload - 'active_substance_key' - 'global_search_text' - 'registry_search_text')::text,'UTF8'),'sha256'),'hex') as reconstructed_sha256
from drx_raw.registry_effective_v1 e
join public.drugs d on d.id=e.source_drug_id;

create or replace view drx_raw.registry_generated_projection_diff_v1 as
select
  d.id as source_drug_id,
  (
    d.active_substance_key is distinct from
    nullif(regexp_replace(lower(btrim(coalesce(d.active_substance,''))),'[^a-z0-9]+','','g'),'')
  ) as active_substance_key_differs,
  (
    d.global_search_text is distinct from
    (
      coalesce(d.trade_name,'') || ' ' ||
      coalesce(d.active_substance,'') || ' ' ||
      coalesce(d.atc_code,'') || ' ' ||
      coalesce(d.drug_class,'') || ' ' ||
      coalesce(d.use_text,'') || ' ' ||
      coalesce(d.strength,'') || ' ' ||
      coalesce(d.pharmaceutical_form,'') || ' ' ||
      coalesce(d.packaging,'')
    )
  ) as global_search_text_differs,
  (
    d.registry_search_text is distinct from
    (
      coalesce(d.trade_name,'') || ' ' ||
      coalesce(d.active_substance,'') || ' ' ||
      coalesce(d.atc_code,'') || ' ' ||
      coalesce(d.drug_class,'') || ' ' ||
      coalesce(d.use_text,'') || ' ' ||
      coalesce(d.strength,'') || ' ' ||
      coalesce(d.pharmaceutical_form,'') || ' ' ||
      coalesce(d.pdid,'') || ' ' ||
      coalesce(d.protocol_no,'')
    )
  ) as registry_search_text_differs
from public.drugs d;

create or replace function public.drx_registry_phase2_status_v1()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, drx_raw
as $$
  select jsonb_build_object(
    'batches',coalesce((select jsonb_agg(jsonb_build_object(
      'batch_id',batch_id,'batch_kind',batch_kind,'source_ref',source_ref,'source_sha256',source_sha256,
      'source_row_count',source_row_count,'preserved_row_count',preserved_row_count,
      'anomaly_row_count',anomaly_row_count,'status',status
    ) order by captured_at,batch_id) from drx_raw.registry_import_batches_v1),'[]'::jsonb),
    'raw_registry_rows',(select count(*) from drx_raw.registry_rows_v1),
    'correction_source_rows',(select count(*) from drx_raw.registry_correction_source_rows_v1),
    'corrections',(select count(*) from drx_raw.registry_corrections_v1),
    'verified_corrections',(select count(*) from drx_raw.registry_corrections_v1 where status='VERIFIKUAR'),
    'corrections_with_evidence',(select count(*) from drx_raw.registry_corrections_v1 where cardinality(evidence_urls)>0),
    'open_anomalies',(select count(*) from drx_raw.registry_anomalies_v1 where state='OPEN'),
    'anomalies_by_code',coalesce((select jsonb_object_agg(anomaly_code,cnt) from (
      select anomaly_code,count(*) cnt from drx_raw.registry_anomalies_v1
      where state='OPEN' group by anomaly_code
    ) x),'{}'::jsonb),
    'reconstruction_rows',(select count(*) from drx_raw.registry_reconstruction_diff_v1),
    'reconstruction_diffs',(select count(*) from drx_raw.registry_reconstruction_diff_v1 where differs),
    'generated_projection_rows',(select count(*) from drx_raw.registry_generated_projection_diff_v1),
    'generated_projection_diffs',(select count(*) from drx_raw.registry_generated_projection_diff_v1
      where active_substance_key_differs or global_search_text_differs or registry_search_text_differs),
    'generated_projection_diff_breakdown',jsonb_build_object(
      'active_substance_key',(select count(*) from drx_raw.registry_generated_projection_diff_v1 where active_substance_key_differs),
      'global_search_text',(select count(*) from drx_raw.registry_generated_projection_diff_v1 where global_search_text_differs),
      'registry_search_text',(select count(*) from drx_raw.registry_generated_projection_diff_v1 where registry_search_text_differs)
    ),
    'publication_allowed',false
  );
$$;

revoke all on function public.drx_registry_phase2_status_v1() from public,anon,authenticated;
grant execute on function public.drx_registry_phase2_status_v1() to service_role;
revoke all on drx_raw.registry_generated_projection_diff_v1 from public,anon,authenticated;
