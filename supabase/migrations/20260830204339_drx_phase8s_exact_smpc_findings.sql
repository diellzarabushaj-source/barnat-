-- DRx Phase 8S: exact-product SmPC evidence findings.
-- Stores immutable exact MK SmPC PDF provenance and blocks Phase 8 build
-- while material V2-vs-exact-SmPC findings remain unresolved.
-- No clinical finding may be auto-resolved and no publication is enabled.

create table if not exists drx_dose.phase8_clinical_rule_findings_v1 (
  finding_id uuid primary key default gen_random_uuid(),
  drug_id uuid not null references public.drugs(id) on delete restrict,
  v2_rule_key text not null,
  source_snapshot_id text not null references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  finding_code text not null,
  severity text not null check (severity in ('BLOCKER','WARNING')),
  observed_v2 jsonb not null,
  exact_smpc_evidence jsonb not null,
  proposed_action jsonb not null,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','APPROVED','REJECTED','RESOLVED')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  automatic_resolution_allowed boolean not null default false
    check (automatic_resolution_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(drug_id,v2_rule_key,finding_code,source_snapshot_id)
);

insert into public.dose_source_snapshots_v3(
  snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
  document_type,document_version,document_date,fetched_at,content_type,content_length,
  raw_sha256,etag,last_modified,parser_version,archive_locator
) values
(
  '389c623396f343c53e15aeae4eff2f26aec3214ef3bfb6937418c6fe80b07c6f',
  'mk-moh-smpc-52577-phase8',
  'https://lekovi.zdravstvo.gov.mk/drugsregister.detaileddrugsregistercomponent:downloadguide/52577?t:ac=detailview/52577',
  'https://lekovi.zdravstvo.gov.mk/drugsregister.detaileddrugsregistercomponent:downloadguide/52577?t:ac=detailview/52577',
  'NON_EU_REGULATOR',
  'Ministry of Health / Medicines Register of North Macedonia',
  'MK','smpc',
  'registry-file-52577@sha256:389c623396f343c5',null,
  '2026-08-30T20:39:27.910Z','application/pdf',3650915,
  '389c623396f343c53e15aeae4eff2f26aec3214ef3bfb6937418c6fe80b07c6f',
  null,null,'visual-review-pending-v1',
  'https://github.com/diellzarabushaj-source/barnat-/actions/runs/33334244002'
),
(
  '5f8c63fd69fbbd6f96462dda7d507550e3064d52ed51904fd87d7d0181aae8a3',
  'mk-moh-smpc-51848-phase8',
  'https://lekovi.zdravstvo.gov.mk/drugsregister.detaileddrugsregistercomponent:downloadguide/51848?t:ac=detailview/51848',
  'https://lekovi.zdravstvo.gov.mk/drugsregister.detaileddrugsregistercomponent:downloadguide/51848?t:ac=detailview/51848',
  'NON_EU_REGULATOR',
  'Ministry of Health / Medicines Register of North Macedonia',
  'MK','smpc',
  'registry-file-51848@sha256:5f8c63fd69fbbd6f',null,
  '2026-08-30T20:39:32.216Z','application/pdf',5446037,
  '5f8c63fd69fbbd6f96462dda7d507550e3064d52ed51904fd87d7d0181aae8a3',
  null,null,'visual-review-pending-v1',
  'https://github.com/diellzarabushaj-source/barnat-/actions/runs/33334244002'
)
on conflict (snapshot_id) do nothing;

insert into drx_dose.phase8_clinical_rule_findings_v1(
  drug_id,v2_rule_key,source_snapshot_id,finding_code,severity,
  observed_v2,exact_smpc_evidence,proposed_action
) values
('c8cd0467-da73-479c-b8e8-b785af833f59','RULE-COALMACIN-PED-MILD-25MGKGDAY-BID',
 '389c623396f343c53e15aeae4eff2f26aec3214ef3bfb6937418c6fe80b07c6f',
 'MIN_AGE_BELOW_EXACT_SMPC_RECOMMENDATION','BLOCKER',
 '{"minAgeMonths":0}'::jsonb,
 '{"section":"4.2","statement":"No dosing recommendation can be made for 7:1 formulations in patients under 2 months."}'::jsonb,
 '{"action":"CLINICAL_REVIEW_REQUIRED","candidateMinAgeMonths":2}'::jsonb),
('c8cd0467-da73-479c-b8e8-b785af833f59','RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID',
 '389c623396f343c53e15aeae4eff2f26aec3214ef3bfb6937418c6fe80b07c6f',
 'MIN_AGE_BELOW_EXACT_SMPC_RECOMMENDATION','BLOCKER',
 '{"minAgeMonths":0}'::jsonb,
 '{"section":"4.2","statement":"No dosing recommendation can be made for 7:1 formulations in patients under 2 months."}'::jsonb,
 '{"action":"CLINICAL_REVIEW_REQUIRED","candidateMinAgeMonths":2}'::jsonb),
('c8cd0467-da73-479c-b8e8-b785af833f59','RULE-COALMACIN-PED-MILD-25MGKGDAY-BID',
 '389c623396f343c53e15aeae4eff2f26aec3214ef3bfb6937418c6fe80b07c6f',
 'PRODUCT_PRESENTATION_WEIGHT_BOUNDARY','WARNING',
 '{"maxWeightKg":null}'::jsonb,
 '{"section":"4.2","statement":"Children at or above 40 kg should be treated with adult formulations; this suspension dosing is described for children under 40 kg."}'::jsonb,
 '{"action":"REVIEW_PRODUCT_BINDING_WEIGHT_BOUNDARY","boundaryKg":40}'::jsonb),
('c8cd0467-da73-479c-b8e8-b785af833f59','RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID',
 '389c623396f343c53e15aeae4eff2f26aec3214ef3bfb6937418c6fe80b07c6f',
 'PRODUCT_PRESENTATION_WEIGHT_BOUNDARY','WARNING',
 '{"maxWeightKg":null}'::jsonb,
 '{"section":"4.2","statement":"Children at or above 40 kg should be treated with adult formulations; this suspension dosing is described for children under 40 kg."}'::jsonb,
 '{"action":"REVIEW_PRODUCT_BINDING_WEIGHT_BOUNDARY","boundaryKg":40}'::jsonb),
('84a1cf4a-6568-41d7-8d13-0f2b7715acae','RULE-PARACETAMOL-ALKALOID-500-13PLUS',
 '5f8c63fd69fbbd6f96462dda7d507550e3064d52ed51904fd87d7d0181aae8a3',
 'AGE_BAND_OVERLAPS_LOWER_DOSE_GROUP','BLOCKER',
 '{"minAgeMonths":156,"doseMinMg":500,"doseMaxMg":1000}'::jsonb,
 '{"section":"4.2","statement":"Exact product SmPC gives 500-1000 mg every 4-6 hours for age 16 years and older; age 10-15 years receives 500 mg."}'::jsonb,
 '{"action":"CLINICAL_REVIEW_REQUIRED","candidateAdultMinAgeMonths":192,"candidateAdolescentBandMonths":[120,191],"candidateAdolescentDoseMg":500}'::jsonb),
('84a1cf4a-6568-41d7-8d13-0f2b7715acae','RULE-PARACETAMOL-ALKALOID-500-AGE6TO12',
 '5f8c63fd69fbbd6f96462dda7d507550e3064d52ed51904fd87d7d0181aae8a3',
 'EXACT_SMPC_NOT_RECOMMENDED_UNDER_10','BLOCKER',
 '{"minAgeMonths":72,"maxAgeMonths":155,"doseMinMg":250,"doseMaxMg":500}'::jsonb,
 '{"section":"4.2","statement":"Exact product SmPC is not intended for children under 10 years; age 10-15 years receives one 500 mg tablet every 4-6 hours, maximum four daily."}'::jsonb,
 '{"action":"CLINICAL_REVIEW_REQUIRED","candidateMinAgeMonths":120,"candidateMaxAgeMonths":191,"candidateDoseMg":500,"candidateMaxDoses24h":4}'::jsonb)
on conflict (drug_id,v2_rule_key,finding_code,source_snapshot_id) do nothing;

create or replace function public.drx_phase8_clinical_correction_packet_v1()
returns jsonb
language sql stable security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'packetVersion','drx-phase8-clinical-correction-packet-v1',
  'generatedAt',clock_timestamp(),
  'requiresClinicalReviewer',true,
  'automaticResolutionAllowed',false,
  'publicationAllowed',false,
  'phase9StartAllowed',false,
  'blockerCount',count(*) filter(where f.severity='BLOCKER' and f.review_status<>'RESOLVED'),
  'warningCount',count(*) filter(where f.severity='WARNING' and f.review_status<>'RESOLVED'),
  'findings',coalesce(jsonb_agg(jsonb_build_object(
    'findingId',f.finding_id,'drugId',f.drug_id,'tradeName',d.trade_name,
    'ruleKey',f.v2_rule_key,'findingCode',f.finding_code,'severity',f.severity,
    'reviewStatus',f.review_status,'sourceSnapshotId',f.source_snapshot_id,
    'sourceUrl',s.source_url,'sourceKey',s.source_key,'documentVersion',s.document_version,
    'observedV2',f.observed_v2,'exactSmPCEvidence',f.exact_smpc_evidence,
    'proposedAction',f.proposed_action
  ) order by d.trade_name,f.severity desc,f.v2_rule_key,f.finding_code),'[]'::jsonb)
)
from drx_dose.phase8_clinical_rule_findings_v1 f
join public.drugs d on d.id=f.drug_id
join public.dose_source_snapshots_v3 s on s.snapshot_id=f.source_snapshot_id;
$$;

revoke all on function public.drx_phase8_clinical_correction_packet_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase8_clinical_correction_packet_v1()
  to service_role;

create or replace function public.drx_phase8_pilot_build_preflight_v1()
returns jsonb
language sql stable security definer
set search_path=pg_catalog,public,drx_dose
as $$
with pilot as (
  select
    r.drug_id,r.v2_product_key,r.trade_name,r.pilot_status,
    r.snapshot_status='INGESTED' and r.source_snapshot_id is not null as exact_source_snapshot_ready,
    r.exact_product_binding_verified,
    r.clinical_reference_source_status='INGESTED' and r.clinical_reference_snapshot_id is not null as clinical_reference_ingested,
    r.clinical_reference_presentation_status='MATCHED' as clinical_reference_presentation_matched,
    r.clinical_reference_review_status='VERIFIED' as clinical_reference_reviewed,
    (select count(*) from drx_dose.phase8_clinical_rule_findings_v1 f
      where f.drug_id=r.drug_id and f.severity='BLOCKER' and f.review_status<>'RESOLVED') as unresolved_clinical_findings,
    (select count(*) from public.dose_products_v3 p
      where p.drug_id=r.drug_id and p.editorial_status='published') as v3_published_product_count,
    (select count(distinct b.rule_id)
       from public.dose_products_v3 p
       join public.dose_rule_products_v3 b on b.product_id=p.product_id
       join public.dose_rules_v3 dr on dr.rule_id=b.rule_id
      where p.drug_id=r.drug_id and p.editorial_status='published'
        and b.binding_status='verified' and dr.editorial_status='published') as v3_published_rule_count,
    (select count(*) from public.dose_products_v3 p
       join public.dose_rule_products_v3 b on b.product_id=p.product_id
      where p.drug_id=r.drug_id and p.editorial_status='published'
        and b.binding_status='verified') as v3_verified_binding_count
  from drx_dose.phase8_pilot_readiness_v1 r
), annotated as (
  select p.*,array_remove(array[
    case when not p.exact_source_snapshot_ready then 'EXACT_SOURCE_SNAPSHOT_MISSING' end,
    case when not p.exact_product_binding_verified then 'EXACT_PRODUCT_REVIEW_PENDING' end,
    case when not p.clinical_reference_ingested then 'CLINICAL_REFERENCE_SNAPSHOT_MISSING' end,
    case when not p.clinical_reference_presentation_matched then 'CLINICAL_REFERENCE_PRESENTATION_UNMATCHED' end,
    case when not p.clinical_reference_reviewed then 'CLINICAL_REFERENCE_REVIEW_PENDING' end,
    case when p.unresolved_clinical_findings>0 then 'EXACT_SMPC_RULE_REVIEW_PENDING' end,
    case when p.v3_published_product_count=0 then 'V3_PRODUCT_NOT_PUBLISHED' end,
    case when p.v3_published_rule_count=0 then 'V3_RULES_NOT_PUBLISHED' end,
    case when p.v3_verified_binding_count=0 then 'V3_PRODUCT_RULE_BINDINGS_NOT_VERIFIED' end
  ],null)::text[] blocker_codes
  from pilot p
)
select jsonb_build_object(
  'preflightVersion','drx-phase8-pilot-build-preflight-v2',
  'generatedAt',clock_timestamp(),'requiredPilotCount',2,
  'pilotCount',(select count(*) from annotated),
  'clinicalReviewsVerified',(select count(*) from annotated where clinical_reference_reviewed),
  'unresolvedClinicalFindings',(select coalesce(sum(unresolved_clinical_findings),0) from annotated),
  'pilotsReadyForV3Build',(select count(*) from annotated
    where exact_source_snapshot_ready and exact_product_binding_verified
      and clinical_reference_ingested and clinical_reference_presentation_matched
      and clinical_reference_reviewed and unresolved_clinical_findings=0),
  'pilotsPublishedInV3',(select count(*) from annotated
    where v3_published_product_count=1 and v3_published_rule_count>0
      and v3_verified_binding_count=v3_published_rule_count),
  'pilots',coalesce((select jsonb_agg(jsonb_build_object(
      'drugId',a.drug_id,'productKey',a.v2_product_key,'tradeName',a.trade_name,
      'pilotStatus',a.pilot_status,'exactSourceSnapshotReady',a.exact_source_snapshot_ready,
      'exactProductIdentityVerified',a.exact_product_binding_verified,
      'clinicalReferenceIngested',a.clinical_reference_ingested,
      'clinicalReferencePresentationMatched',a.clinical_reference_presentation_matched,
      'clinicalReferenceReviewed',a.clinical_reference_reviewed,
      'unresolvedClinicalFindings',a.unresolved_clinical_findings,
      'v3PublishedProductCount',a.v3_published_product_count,
      'v3PublishedRuleCount',a.v3_published_rule_count,
      'v3VerifiedBindingCount',a.v3_verified_binding_count,
      'blockerCodes',to_jsonb(a.blocker_codes)
    ) order by a.trade_name) from annotated a),'[]'::jsonb),
  'humanClinicalReviewRequired',true,
  'automaticClinicalReviewEnabled',false,
  'automaticPublicationEnabled',false,
  'preflightPass',(select count(*)=2 and count(*) filter(where cardinality(blocker_codes)=0)=2 from annotated)
);
$$;

revoke all on function public.drx_phase8_pilot_build_preflight_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase8_pilot_build_preflight_v1()
  to service_role;

revoke all on all tables in schema drx_dose from public,anon,authenticated;
revoke execute on all functions in schema drx_dose from public,anon,authenticated;
revoke all on schema drx_dose from public,anon,authenticated;
