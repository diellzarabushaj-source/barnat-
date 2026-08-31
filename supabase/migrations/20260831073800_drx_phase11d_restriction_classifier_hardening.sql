-- DRx Phase 11D: safely classify restriction-only legacy text.
-- This migration does NOT create dose rules and does NOT publish anything.
-- It only moves clearly non-dosing restriction statements out of TEXT_ONLY.

create or replace function drx_dose.classify_restriction_only_v1(p_dose_text text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_dose_text,'')) ~ '(nuk rekomandohet|nuk indikohet|nuk duhet të përdoret|nuk duhet te perdoret|kundërindikohet|kunderindikohet|nuk ka dozë|nuk ka doze|siguria dhe efikasiteti.*nuk)'
     and lower(coalesce(p_dose_text,'')) !~ '[0-9]+([.,][0-9]+)?[[:space:]]*(mg|mcg|µg|g|ml|iu|u|unit|njësi|njesi|tablet|kapsul|pik|inhalim)'
      then 'RESTRICTION_ONLY'
    else 'NOT_RESTRICTION_ONLY'
  end;
$$;

update drx_dose.rule_candidate_extractions_v1
set
  parser_status='BLOCKED',
  parsed_rule_payload=jsonb_build_object(
    'classification','RESTRICTION_ONLY',
    'calculable',false,
    'confidence',1,
    'reasonCodes',jsonb_build_array('RESTRICTION_ONLY_NO_DOSE_RULE'),
    'rawText',dose_text
  ),
  reason_codes=array['RESTRICTION_ONLY_NO_DOSE_RULE']::text[],
  parser_confidence=1,
  updated_at=now()
where parser_status='TEXT_ONLY'
  and drx_dose.classify_restriction_only_v1(dose_text)='RESTRICTION_ONLY'
  and review_status='PENDING';

create or replace view drx_dose.restriction_only_candidates_v1 as
select
  candidate_id,legacy_regimen_id,drug_id,registry_number,trade_name,
  patient_group,population_raw,indication_text,dose_text,source_url,
  parser_status,reason_codes,review_status
from drx_dose.rule_candidate_extractions_v1
where reason_codes @> array['RESTRICTION_ONLY_NO_DOSE_RULE']::text[];

revoke all on function drx_dose.classify_restriction_only_v1(text) from public,anon,authenticated;
grant execute on function drx_dose.classify_restriction_only_v1(text) to service_role;
revoke all on drx_dose.restriction_only_candidates_v1 from public,anon,authenticated;
grant select on drx_dose.restriction_only_candidates_v1 to service_role;
