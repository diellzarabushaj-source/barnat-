
-- DRx Phase 11AW: normalize ceftriaxone disodium to ceftriaxone active moiety
-- using the official Kosovo AKPPM product-list declaration for Desefin 1 g.
-- This merges duplicate salt/base dose targets without changing product identity.

do $$
declare
  v_source_url text := 'https://akppm.rks-gov.net/CMS/Medias/Lista%20zyrtare%20e%20cmimeve%20te%20produkteve%20medicinale.pdf';
  v_source_key text := 'KOSOVO-AKPPM-DESEFIN-CEFTRIAXONE-DISODIUM-MOIETY';
  v_s2 text := 'Official Kosovo AKPPM product-list entry for Desefin 1 g I.M/I.V declares the active substance as Ceftriaxone disodium (Equivalent to 1 g Ceftriaxone base), ATC J01DD04, strength 1 g.';
  v_raw text;
  v_snapshot text;
begin
  v_raw := concat_ws(E'\n\n',
    'Source: Kosovo Agency for Medicinal Products and Equipment (AKPPM)',
    'Document: official wholesale/retail medicinal-product price list',
    'Product: Desefin 1 g I.M/I.V',
    'Marketing authorisation reference: RMA-3449/10/07/2023',
    'URL: '||v_source_url,
    'Normalized active-substance declaration: '||v_s2
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'KOSOVO_AKPPM',
    'Kosovo Agency for Medicinal Products and Equipment (AKPPM)',
    'Kosovo','Official medicinal-product list',
    'official-list-desefin-rma-3449',null,now(),
    'text/plain; charset=utf-8; profile=drx-normalized-registry-capture',
    octet_length(v_raw),v_snapshot,'drx-registry-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values (
    v_snapshot,'2','active-substance-declaration',
    'Official active substance / strength declaration',
    v_s2,encode(digest(v_s2,'sha256'),'hex'),
    jsonb_build_object(
      'captureMethod','normalized_official_registry_capture',
      'product','Desefin 1 g I.M/I.V',
      'marketingAuthorisation','RMA-3449/10/07/2023',
      'declaredSalt','Ceftriaxone disodium',
      'declaredActiveMoiety','Ceftriaxone',
      'declaredEquivalentStrength','1 g'
    ),
    'drx-registry-normalized-capture-v1','extracted'
  )
  on conflict (snapshot_id,section_code) do nothing;
end $$;

with src as (
  select s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='2'
   and sec.extraction_status='extracted'
  where s.source_key='KOSOVO-AKPPM-DESEFIN-CEFTRIAXONE-DISODIUM-MOIETY'
  order by s.created_at desc
  limit 1
),
ids as (
  select
    (select concept_id from public.substance_concepts_v1
      where canonical_key='ceftriaxonedisodium') as source_id,
    (select concept_id from public.substance_concepts_v1
      where canonical_key='ceftriaxone') as target_id
)
insert into drx_dose.component_moiety_map_v1(
  source_concept_id,dose_moiety_concept_id,mapping_kind,
  source_snapshot_id,source_section_code,source_section_sha256,
  mapping_status,verified_by,verified_at,note
)
select
  ids.source_id,ids.target_id,'ACTIVE_MOIETY',
  src.snapshot_id,'2',src.section_sha256,
  'VERIFIED','system:phase11aw-akppm-desefin-composition',now(),
  'Official AKPPM product declaration states ceftriaxone disodium is equivalent to the labelled ceftriaxone base strength.'
from ids cross join src
where ids.source_id is not null and ids.target_id is not null
on conflict (source_concept_id) do nothing;
