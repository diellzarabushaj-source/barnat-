
-- DRx Phase 11BY: official exact-market source discovery for current strict
-- ceftriaxone product-shell candidates. Discovery only: no source snapshot,
-- capture, binding verification, product shell or publication is created.

with seed(
  registry_number,v2_source_key,source_url,source_authority,source_jurisdiction,
  source_tier,external_registry_id,observed_trade_name,observed_strength,
  observed_form,observed_packaging,observed_manufacturer,observed_ma_holder,
  identity_match_status,identity_match_dimensions,discovery_note
) as (
  values
  (
    676,
    'SRC-MK-REG-FORSEF-1G-IM-52113',
    'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/52113',
    'Ministry of Health / Medicines Register of North Macedonia',
    'MK','NON_EU_REGULATOR','52113',
    'FORSEF','1 g I.M.','Powder and solvent for solution for injection',
    '1 vial with 1 g powder + 1 ampoule with 4 ml 1% lidocaine solvent',
    'BILIM Pharmaceuticals A.S., Turkey','ALKALOID KONS DOOEL',
    'EXACT_PRODUCT_CANDIDATE',
    jsonb_build_object(
      'tradeName',true,'atc',true,'strength',true,'route','IM',
      'form',true,'manufacturer',true,'packaging','compatible',
      'authorizationVersion','external-market'
    ),
    'Official MK medicines-register record matches FORSEF 1 g IM identity. Capture and reviewer verification are still required before any product shell can be published.'
  ),
  (
    982,
    'SRC-GR-EOF-VERACOL-1G-IM-205180301',
    'https://www.eof.gr/en/wp-content/uploads/2026/03/%CE%93%CE%B5%CE%BD%CF%8C%CF%83%CE%B7%CE%BC%CE%B1-%CE%94%CE%B5%CE%BA%CE%B5%CE%BC%CE%B2%CF%81%CE%AF%CE%BF%CF%85-2025_%CE%A4%CE%B5%CE%BB%CE%B9%CE%BA%CE%AD%CF%82-%CE%A0%CF%81%CE%BF%CF%84%CE%B5%CE%B9%CE%BD%CF%8C%CE%BC%CE%B5%CE%BD%CE%B5%CF%82.pdf',
    'National Organization for Medicines (EOF), Greece',
    'GR','EU_NATIONAL','205180301',
    'VERACOL','1 g I.M.','Powder and solvent for solution for injection',
    '1 vial + 1 ampoule x 3.5 ml solvent',
    'DEMO S.A. Pharmaceutical Industry, Greece','DEMO ABEE',
    'EXACT_PRODUCT_CANDIDATE',
    jsonb_build_object(
      'tradeName',true,'atc',true,'strength',true,'route','IM',
      'form',true,'manufacturer',true,'packaging',true,
      'eofProductCode','205180301'
    ),
    'Current official Greek EOF record matches VERACOL 1 g IM product identity. Raw source capture and explicit binding review remain mandatory.'
  ),
  (
    991,
    'SRC-GR-EOF-VERACOL-1G-IV-205180201',
    'https://www.eof.gr/en/wp-content/uploads/2026/02/%CE%91%CE%9D%CE%91%CE%A0%CE%A1%CE%9F%CE%A3%CE%91%CE%A1%CE%9C%CE%9F%CE%93%CE%95%CE%A3-%CE%A4%CE%99%CE%9C%CE%A9%CE%9D-2025_%CE%A0%CE%A1%CE%9F%CE%A4%CE%95%CE%99%CE%9D%CE%9F%CE%9C%CE%95%CE%9D%CE%95%CE%A3-%CE%A0%CE%A1%CE%9F%CE%A3-%CE%94%CE%99%CE%91%CE%92%CE%9F%CE%A5%CE%9B%CE%95%CE%A5%CE%A3%CE%97.pdf',
    'National Organization for Medicines (EOF), Greece',
    'GR','EU_NATIONAL','205180201',
    'VERACOL','1 g I.V.','Powder and solvent for solution for injection',
    '1 vial + 1 ampoule x 10 ml solvent',
    'DEMO S.A. Pharmaceutical Industry, Greece','DEMO ABEE',
    'EXACT_PRODUCT_CANDIDATE',
    jsonb_build_object(
      'tradeName',true,'atc',true,'strength',true,'route','IV',
      'form',true,'manufacturer',true,'packaging',true,
      'eofProductCode','205180201'
    ),
    'Current official Greek EOF record matches VERACOL 1 g IV product identity. Raw source capture and explicit binding review remain mandatory.'
  ),
  (
    1064,
    'SRC-KS-AKPPM-DESEFIN-05G',
    'https://msh.rks-gov.net/Documents/DownloadDocument?fileName=Vendi52614574.3635.pdf',
    'Kosovo Ministry of Health / AKPPM official medicinal-product price list',
    'XK','KOSOVO_AKPPM','RMA-2514/29/09/2021',
    'DESEFIN','0.5 g','Powder for solution for injection',
    '1 vial + 1 ampoule',
    'DEVA HOLDING A.S., Turkey','DEVA HOLDING A.S., Turkey',
    'PARTIAL_PRODUCT_CANDIDATE',
    jsonb_build_object(
      'tradeName',true,'atc',true,'strength',true,'form',true,
      'manufacturer',true,'packaging','partial','route','not_explicit',
      'authorizationVersion','older-listed-record'
    ),
    'Official Kosovo list confirms DESEFIN 0.5 g identity but the listed record does not uniquely prove the current IV presentation/version. Keep partial until an exact current product source is captured.'
  ),
  (
    1399,
    'SRC-KS-AKPPM-CEFTRIAXON-KABI-2G-MA0151',
    'https://msh.rks-gov.net/Documents/DownloadDocument?fileName=Lista38997313.68.pdf',
    'Kosovo Ministry of Health / AKPPM official medicinal-product database',
    'XK','KOSOVO_AKPPM','MA-0151/05/08/2021',
    'CefTRIAXON Kabi','2 g','Powder for solution for infusion',
    '50 ml glass vial; 10-unit market pack',
    'Labesfal Laboratórios Almiro S.A., Portugal','Fresenius Kabi Deutschland GmbH, Germany',
    'EXACT_PRODUCT_CANDIDATE',
    jsonb_build_object(
      'tradeName',true,'atc',true,'strength',true,'route','IV',
      'form',true,'manufacturer',true,'authorization',true,
      'packaging','compatible'
    ),
    'Official Kosovo medicinal-product database matches CefTRIAXON Kabi 2 g including MA-0151/05/08/2021. Immutable capture and reviewer verification are still required.'
  ),
  (
    2029,
    'SRC-KS-AKPPM-BETASPORINA-1000MG10ML-MA0209',
    'https://msh.rks-gov.net/Documents/DownloadDocument?fileName=Vendi28511607.4092.pdf',
    'Kosovo Ministry of Health / AKPPM official medicinal-product price list',
    'XK','KOSOVO_AKPPM','MA-0209/15/10/2021',
    'BETASPORINA','1000 mg/10 ml','Powder and solvent for solution for injection',
    '1 vial + 10 ml solvent ampoule',
    'Laboratórios Atral S.A., Portugal','LABORATORIES ATRAL S.A., Portugal',
    'EXACT_PRODUCT_CANDIDATE',
    jsonb_build_object(
      'tradeName',true,'atc',true,'strength',true,'route','IV',
      'form',true,'manufacturer',true,'authorization',true,
      'packaging','compatible'
    ),
    'Official Kosovo price-list record matches BETASPORINA 1000 mg/10 ml and MA-0209/15/10/2021. Capture and reviewer verification remain mandatory.'
  ),
  (
    2072,
    'SRC-KS-AKPPM-TORNAXON-2G-MA0020',
    'https://msh.rks-gov.net/Documents/DownloadDocument?fileName=Lista47906846.6087.pdf',
    'Kosovo Ministry of Health / AKPPM official medicinal-product database',
    'XK','KOSOVO_AKPPM','MA-0020/11/03/2021',
    'TORNAXON','2 g','Powder for solution for infusion',
    'glass vial containing 2 g powder for solution for infusion',
    'Laboratorio Farmaceutico CT S.r.l., Italy','LABORATORIO FARMACEUTICO CT SRL, Italy',
    'EXACT_PRODUCT_CANDIDATE',
    jsonb_build_object(
      'tradeName',true,'atc',true,'strength',true,'route','IV',
      'form',true,'manufacturer',true,'authorization',true,'packaging',true
    ),
    'Official Kosovo medicinal-product database matches TORNAXON 2 g and MA-0020/11/03/2021. Capture and reviewer verification remain mandatory.'
  )
)
insert into drx_dose.phase8_exact_source_discovery_v1(
  drug_id,v2_product_key,v2_source_key,source_url,source_authority,source_jurisdiction,
  source_tier,external_registry_id,observed_trade_name,observed_strength,observed_form,
  observed_packaging,observed_manufacturer,observed_ma_holder,identity_match_dimensions,
  identity_match_status,source_snapshot_id,snapshot_status,clinical_evidence_status,
  publication_eligible,discovery_note,discovered_by,checked_at
)
select
  d.id,
  'REGISTRY-PDID-'||coalesce(d.source_payload->>'PDID',d.registry_number::text),
  s.v2_source_key,s.source_url,s.source_authority,s.source_jurisdiction,s.source_tier,
  s.external_registry_id,s.observed_trade_name,s.observed_strength,s.observed_form,
  s.observed_packaging,s.observed_manufacturer,s.observed_ma_holder,
  s.identity_match_dimensions,s.identity_match_status,
  null,'MISSING','UNASSESSED',false,s.discovery_note,
  'phase11_official_source_discovery',now()
from seed s
join public.drugs d on d.registry_number=s.registry_number
where d.is_published=true
on conflict (drug_id,source_url) do nothing;

create or replace view drx_dose.product_shell_source_discovery_v2 as
select
  q.drug_id,q.registry_number,q.trade_name,q.pharmaceutical_form,
  q.product_id,q.product_key,q.product_shell_status,
  q.exact_market_snapshot_id,q.exact_market_source_key,
  d.discovery_id,d.source_url,d.source_authority,d.source_jurisdiction,d.source_tier,
  d.external_registry_id,d.identity_match_status,d.snapshot_status,
  d.clinical_evidence_status,d.discovery_note,
  case
    when q.product_id is not null and q.product_shell_status='published'
      then 'SHELL_PUBLISHED'
    when q.product_id is not null
      then 'REVIEW_EXISTING_SHELL'
    when q.exact_market_snapshot_id is not null
      then 'EXACT_MARKET_SOURCE_READY_FOR_SHELL'
    when d.identity_match_status='EXACT_PRODUCT_CANDIDATE' and d.snapshot_status='MISSING'
      then 'CAPTURE_EXACT_SOURCE'
    when d.identity_match_status='EXACT_PRODUCT_CANDIDATE' and d.snapshot_status='INGESTED'
      then 'REVIEW_EXACT_SOURCE_BINDING'
    when d.identity_match_status='PARTIAL_PRODUCT_CANDIDATE'
      then 'RESOLVE_SOURCE_IDENTITY'
    else 'DISCOVER_EXACT_MARKET_PRODUCT_SOURCE'
  end as next_action,
  false::boolean as auto_capture_allowed,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.product_shell_provisioning_queue_v1 q
left join lateral (
  select x.*
  from drx_dose.phase8_exact_source_discovery_v1 x
  where x.drug_id=q.drug_id
    and x.identity_match_status in ('EXACT_PRODUCT_CANDIDATE','PARTIAL_PRODUCT_CANDIDATE')
  order by
    case x.identity_match_status when 'EXACT_PRODUCT_CANDIDATE' then 1 else 2 end,
    x.checked_at desc
  limit 1
) d on true;

create or replace view drx_dose.product_shell_source_discovery_summary_v1 as
select
  count(*) as product_shell_candidates,
  count(*) filter (where identity_match_status='EXACT_PRODUCT_CANDIDATE') as exact_source_discoveries,
  count(*) filter (where identity_match_status='PARTIAL_PRODUCT_CANDIDATE') as partial_source_discoveries,
  count(*) filter (where next_action='CAPTURE_EXACT_SOURCE') as exact_sources_to_capture,
  count(*) filter (where next_action='RESOLVE_SOURCE_IDENTITY') as identity_source_review,
  count(*) filter (where next_action='DISCOVER_EXACT_MARKET_PRODUCT_SOURCE') as discovery_remaining,
  count(*) filter (where next_action='SHELL_PUBLISHED') as published_shells,
  false::boolean as auto_publish_allowed
from drx_dose.product_shell_source_discovery_v2;

revoke all on drx_dose.product_shell_source_discovery_v2 from public,anon,authenticated;
revoke all on drx_dose.product_shell_source_discovery_summary_v1 from public,anon,authenticated;
grant select on drx_dose.product_shell_source_discovery_v2 to service_role;
grant select on drx_dose.product_shell_source_discovery_summary_v1 to service_role;
