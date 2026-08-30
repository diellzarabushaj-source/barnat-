create table if not exists drx_dose.phase8_exact_source_discovery_v1 (
  discovery_id uuid primary key default gen_random_uuid(),
  drug_id uuid not null references public.drugs(id) on delete restrict,
  v2_product_key text not null,
  v2_source_key text not null,
  source_url text not null check (source_url ~ '^https://'),
  source_authority text not null check (nullif(btrim(source_authority),'') is not null),
  source_jurisdiction text not null check (nullif(btrim(source_jurisdiction),'') is not null),
  source_tier text not null check (source_tier in ('EU_NATIONAL','KOSOVO_AKPPM','NON_EU_REGULATOR','FALLBACK')),
  external_registry_id text not null check (nullif(btrim(external_registry_id),'') is not null),
  observed_trade_name text not null,
  observed_strength text not null,
  observed_form text not null,
  observed_packaging text not null,
  observed_manufacturer text,
  observed_ma_holder text,
  identity_match_dimensions jsonb not null default '{}'::jsonb,
  identity_match_status text not null check (identity_match_status in (
    'EXACT_PRODUCT_CANDIDATE',
    'PARTIAL_PRODUCT_CANDIDATE',
    'REJECTED'
  )),
  source_snapshot_id text references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  snapshot_status text not null default 'MISSING' check (snapshot_status in ('MISSING','INGESTED','REJECTED')),
  clinical_evidence_status text not null default 'UNASSESSED' check (clinical_evidence_status in (
    'UNASSESSED',
    'REGISTRY_DOSAGE_PRESENT',
    'FULL_SMPC_PRESENT',
    'REJECTED'
  )),
  publication_eligible boolean not null default false check (publication_eligible=false),
  discovery_note text not null,
  discovered_by text not null,
  checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(drug_id,source_url),
  check (
    (snapshot_status='INGESTED' and source_snapshot_id is not null)
    or (snapshot_status<>'INGESTED' and source_snapshot_id is null)
  )
);

create index if not exists drx_phase8_exact_discovery_v2_product_idx
  on drx_dose.phase8_exact_source_discovery_v1(v2_product_key);
create index if not exists drx_phase8_exact_discovery_source_key_idx
  on drx_dose.phase8_exact_source_discovery_v1(v2_source_key);
create index if not exists drx_phase8_exact_discovery_snapshot_idx
  on drx_dose.phase8_exact_source_discovery_v1(source_snapshot_id)
  where source_snapshot_id is not null;

insert into drx_dose.phase8_exact_source_discovery_v1(
  drug_id,v2_product_key,v2_source_key,source_url,
  source_authority,source_jurisdiction,source_tier,external_registry_id,
  observed_trade_name,observed_strength,observed_form,observed_packaging,
  observed_manufacturer,observed_ma_holder,
  identity_match_dimensions,identity_match_status,
  snapshot_status,clinical_evidence_status,publication_eligible,
  discovery_note,discovered_by,checked_at
)
values
(
  'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
  'PROD-COALMACIN-400-57-5ML-PDID149',
  'SRC-MK-REG-COALMACIN-400-57-52577',
  'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/52577',
  'Ministry of Health / Medicines Register of North Macedonia',
  'MK',
  'NON_EU_REGULATOR',
  '52577',
  'CO-ALMACIN',
  '(400 mg/57 mg)/5 ml',
  'Powder for oral suspension',
  '1 dark glass bottle with 17.5 g powder for preparation of 70 ml oral suspension',
  'ALKALOID AD, Skopje',
  'ALKALOID AD SKOPJE',
  '{"trade_name":true,"strength":true,"form":true,"packaging":true,"manufacturer_or_mah":true,"atc":true}'::jsonb,
  'EXACT_PRODUCT_CANDIDATE',
  'MISSING',
  'REGISTRY_DOSAGE_PRESENT',
  false,
  'Exact official registry product candidate for the already-published V2 comparator. No V3 publication until raw source snapshot and exact product review evidence are ingested.',
  'phase8_official_source_audit',
  now()
),
(
  '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid,
  'PROD-PARACETAMOL-ALKALOID-500-PDID1457',
  'SRC-MK-REG-PARACETAMOL-ALKALOID-500-51848',
  'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/51848',
  'Ministry of Health / Medicines Register of North Macedonia',
  'MK',
  'NON_EU_REGULATOR',
  '51848',
  'PARACETAMOL ALKALOID',
  '500 mg',
  'Tablet',
  '500 tablets (50 x 10)',
  'ALKALOID AD, Skopje',
  'ALKALOID AD SKOPJE',
  '{"trade_name":true,"strength":true,"form":true,"packaging":true,"manufacturer_or_mah":true,"atc":true}'::jsonb,
  'EXACT_PRODUCT_CANDIDATE',
  'MISSING',
  'REGISTRY_DOSAGE_PRESENT',
  false,
  'Exact official registry product candidate for the already-published V2 comparator. No V3 publication until raw source snapshot and exact product review evidence are ingested.',
  'phase8_official_source_audit',
  now()
)
on conflict (drug_id,source_url) do update set
  v2_product_key=excluded.v2_product_key,
  v2_source_key=excluded.v2_source_key,
  source_authority=excluded.source_authority,
  source_jurisdiction=excluded.source_jurisdiction,
  source_tier=excluded.source_tier,
  external_registry_id=excluded.external_registry_id,
  observed_trade_name=excluded.observed_trade_name,
  observed_strength=excluded.observed_strength,
  observed_form=excluded.observed_form,
  observed_packaging=excluded.observed_packaging,
  observed_manufacturer=excluded.observed_manufacturer,
  observed_ma_holder=excluded.observed_ma_holder,
  identity_match_dimensions=excluded.identity_match_dimensions,
  identity_match_status=excluded.identity_match_status,
  clinical_evidence_status=excluded.clinical_evidence_status,
  publication_eligible=false,
  discovery_note=excluded.discovery_note,
  discovered_by=excluded.discovered_by,
  checked_at=excluded.checked_at;

create or replace view drx_dose.phase8_published_v2_comparator_v1 as
select
  p.drug_id,
  p.product_key,
  p.trade_name,
  p.active_substance,
  p.atc_code,
  p.pharmaceutical_form,
  p.route,
  p.patient_group,
  p.editorial_status product_editorial_status,
  p.active product_active,
  count(*) filter (
    where rp.editorial_status='published'
      and rp.active=true
      and r.editorial_status='published'
      and r.active=true
  ) published_rule_bindings,
  array_agg(r.rule_key order by r.rule_key) filter (
    where rp.editorial_status='published'
      and rp.active=true
      and r.editorial_status='published'
      and r.active=true
  ) published_rule_keys
from public.dose_products_v2 p
join public.dose_rule_products_v2 rp on rp.product_key=p.product_key
join public.dose_rules_v2 r on r.rule_key=rp.rule_key
where p.editorial_status='published'
  and p.active=true
group by
  p.drug_id,p.product_key,p.trade_name,p.active_substance,p.atc_code,
  p.pharmaceutical_form,p.route,p.patient_group,p.editorial_status,p.active
having count(*) filter (
  where rp.editorial_status='published'
    and rp.active=true
    and r.editorial_status='published'
    and r.active=true
)>0;

create or replace view drx_dose.phase8_pilot_readiness_v1 as
select
  c.drug_id,
  c.product_key v2_product_key,
  c.trade_name,
  c.active_substance,
  c.pharmaceutical_form,
  c.route,
  c.patient_group,
  c.published_rule_bindings,
  c.published_rule_keys,

  d.discovery_id,
  d.v2_source_key,
  d.source_url,
  d.source_authority,
  d.source_jurisdiction,
  d.source_tier,
  d.external_registry_id,
  d.identity_match_status,
  d.identity_match_dimensions,
  d.snapshot_status,
  d.source_snapshot_id,
  d.clinical_evidence_status,

  exists (
    select 1
    from drx_dose.product_source_bindings_v1 b
    join drx_dose.product_source_exact_evidence_v1 e on e.binding_id=b.binding_id
    where b.drug_id=c.drug_id
      and b.binding_status='VERIFIED'
      and b.binding_scope='EXACT_MARKET_PRODUCT'
  ) exact_product_binding_verified,

  case
    when d.discovery_id is null
      then 'NO_EXACT_SOURCE_DISCOVERY'
    when d.identity_match_status<>'EXACT_PRODUCT_CANDIDATE'
      then 'IDENTITY_REVIEW_REQUIRED'
    when d.snapshot_status<>'INGESTED'
      then 'SOURCE_SNAPSHOT_MISSING'
    when not exists (
      select 1
      from drx_dose.product_source_bindings_v1 b
      join drx_dose.product_source_exact_evidence_v1 e on e.binding_id=b.binding_id
      where b.drug_id=c.drug_id
        and b.binding_status='VERIFIED'
        and b.binding_scope='EXACT_MARKET_PRODUCT'
    )
      then 'EXACT_PRODUCT_REVIEW_PENDING'
    else 'READY_FOR_V3_BUILD'
  end pilot_status,

  false::boolean automatic_publication_allowed
from drx_dose.phase8_published_v2_comparator_v1 c
left join drx_dose.phase8_exact_source_discovery_v1 d
  on d.drug_id=c.drug_id
 and d.v2_product_key=c.product_key;

revoke all on drx_dose.phase8_exact_source_discovery_v1 from public,anon,authenticated;
revoke all on schema drx_dose from public,anon,authenticated;

comment on table drx_dose.phase8_exact_source_discovery_v1 is
  'Phase 8 discovery-only exact regulatory product candidates for published V2 comparators. Never publication-eligible until immutable source snapshot and exact product review evidence exist.';
comment on view drx_dose.phase8_published_v2_comparator_v1 is
  'Only V2 products with at least one active published V2 rule+binding; valid shadow comparator pool.';
comment on view drx_dose.phase8_pilot_readiness_v1 is
  'Strict Phase 8 pilot readiness. Exact discovery is not exact evidence; SOURCE_SNAPSHOT_MISSING and review states remain hard blockers.';
