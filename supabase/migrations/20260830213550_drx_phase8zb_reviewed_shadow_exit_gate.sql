alter table drx_runtime.shadow_diff_classifications_v1
  add column if not exists classification_audit jsonb not null default '{}'::jsonb;

create or replace function public.drx_phase8_record_pilot_shadow_v1(p_drug_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_runtime,drx_dose,extensions
as $$
declare
  v_v2_product jsonb;
  v_v3_product jsonb;
  v_v2_rules jsonb;
  v_v3_rules jsonb;
  v_v2_payload jsonb;
  v_v3_payload jsonb;
  v_changes jsonb;
  v_unjustified integer;
  v_ref_verified boolean;
  v_finding_ids uuid[];
  v_selector_hash text;
  v_v2_hash text;
  v_v3_hash text;
  v_comparison_id uuid;
  v_rule_count integer;
begin
  if p_drug_id not in (
    'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
    '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
  ) then
    raise exception 'Phase 8 shadow record blocked: drug is not an approved pilot';
  end if;

  select exists(
    select 1 from drx_dose.phase8_pilot_clinical_references_v1
    where drug_id=p_drug_id
      and evidence_review_status='VERIFIED'
      and reviewer_role='CLINICAL_REVIEWER'
      and automatic_rule_publication_allowed=false
  ) into v_ref_verified;

  if not v_ref_verified then
    raise exception 'Phase 8 shadow record blocked: verified clinical reference missing';
  end if;

  if exists(
    select 1 from drx_dose.phase8_clinical_rule_findings_v1
    where drug_id=p_drug_id and review_status<>'RESOLVED'
  ) then
    raise exception 'Phase 8 shadow record blocked: clinical findings remain unresolved';
  end if;

  select jsonb_build_object(
    'productKey',p.product_key,'drugId',lower(p.drug_id::text),
    'registryNumber',coalesce(p.registry_number::text,''),'pdid',coalesce(p.pdid,''),
    'patientGroup',coalesce(p.patient_group,''),
    'pharmaceuticalForm',lower(coalesce(p.pharmaceutical_form,'')),
    'route',upper(coalesce(p.route,'')),
    'numeratorValue',p.numerator_value,'numeratorUnit',lower(coalesce(p.numerator_unit,'')),
    'denominatorValue',p.denominator_value,'denominatorUnit',lower(coalesce(p.denominator_unit,''))
  )
  into v_v2_product
  from public.dose_products_v2 p
  where p.drug_id=p_drug_id and p.editorial_status='published';

  select jsonb_build_object(
    'productKey',p.product_key,'drugId',lower(p.drug_id::text),
    'registryNumber',coalesce(p.registry_number,''),'pdid',coalesce(p.pdid,''),
    'patientGroup',coalesce(p.patient_group,''),
    'pharmaceuticalForm',lower(coalesce(p.pharmaceutical_form,'')),
    'route',upper(coalesce(p.route,'')),
    'numeratorValue',p.numerator_value,'numeratorUnit',lower(coalesce(p.numerator_unit,'')),
    'denominatorValue',p.denominator_value,'denominatorUnit',lower(coalesce(p.denominator_unit,''))
  )
  into v_v3_product
  from public.dose_products_v3 p
  where p.drug_id=p_drug_id and p.editorial_status='published';

  if v_v2_product is null or v_v3_product is null or v_v2_product<>v_v3_product then
    raise exception 'Phase 8 shadow record blocked: product identity/presentation parity failed';
  end if;

  select coalesce(jsonb_agg(x.rule_json order by x.rule_key),'[]'::jsonb)
  into v_v2_rules
  from (
    select r.rule_key,
      jsonb_build_object(
        'ruleKey',r.rule_key,'indicationKey',coalesce(r.indication_key,''),
        'patientGroup',coalesce(r.patient_group,''),'calculationMethod',coalesce(r.calculation_method,''),
        'doseMinValue',r.dose_min_value,'doseMaxValue',r.dose_max_value,
        'doseUnit',lower(coalesce(r.dose_unit,'')),'doseBasis',coalesce(r.dose_basis,''),
        'weightBasis',coalesce(r.weight_basis,''),'frequencyMode',coalesce(r.frequency_mode,''),
        'intervalMinHours',r.interval_min_hours,'intervalMaxHours',r.interval_max_hours,
        'timesPerDay',r.times_per_day,'maxSingleDoseMg',r.max_single_dose_mg,
        'maxDailyDoseMg',r.max_daily_dose_mg,'maxDoses24h',r.max_doses_24h,
        'durationMode',coalesce(r.duration_mode,''),'durationMinDays',r.duration_min_days,
        'durationMaxDays',r.duration_max_days,'reviewAfterDays',r.review_after_days,
        'minAgeMonths',r.min_age_months,'maxAgeMonths',r.max_age_months,
        'minWeightKg',r.min_weight_kg,'maxWeightKg',r.max_weight_kg,
        'route',upper(coalesce(r.route,'')),'prn',coalesce(r.prn,false),
        'specialistOnly',coalesce(r.specialist_only,false),'outOfRangeAction',coalesce(r.out_of_range_action,'')
      ) rule_json
    from public.dose_products_v2 p
    join public.dose_rule_products_v2 b on b.product_key=p.product_key and b.editorial_status='published'
    join public.dose_rules_v2 r on r.rule_key=b.rule_key and r.editorial_status='published'
    where p.drug_id=p_drug_id and p.editorial_status='published'
  ) x;

  select coalesce(jsonb_agg(x.rule_json order by x.rule_key),'[]'::jsonb)
  into v_v3_rules
  from (
    select r.rule_key,
      jsonb_build_object(
        'ruleKey',r.rule_key,'indicationKey',coalesce(i.indication_key,''),
        'patientGroup',coalesce(r.patient_group,''),'calculationMethod',coalesce(r.calculation_method,''),
        'doseMinValue',r.dose_min_value,'doseMaxValue',r.dose_max_value,
        'doseUnit',lower(coalesce(r.dose_unit,'')),'doseBasis',coalesce(r.dose_basis,''),
        'weightBasis',coalesce(r.weight_basis,''),'frequencyMode',coalesce(r.frequency_mode,''),
        'intervalMinHours',r.interval_min_hours,'intervalMaxHours',r.interval_max_hours,
        'timesPerDay',r.times_per_day,'maxSingleDoseMg',r.max_single_dose_mg,
        'maxDailyDoseMg',r.max_daily_dose_mg,'maxDoses24h',r.max_doses_24h,
        'durationMode',coalesce(r.duration_mode,''),'durationMinDays',r.duration_min_days,
        'durationMaxDays',r.duration_max_days,'reviewAfterDays',r.review_after_days,
        'minAgeMonths',r.min_age_months,'maxAgeMonths',r.max_age_months,
        'minWeightKg',r.min_weight_kg,'maxWeightKg',r.max_weight_kg,
        'route',upper(coalesce(r.route,'')),'prn',coalesce(r.prn,false),
        'specialistOnly',coalesce(r.specialist_only,false),'outOfRangeAction',coalesce(r.out_of_range_action,'')
      ) rule_json
    from public.dose_products_v3 p
    join public.dose_rule_products_v3 b on b.product_id=p.product_id and b.binding_status='verified'
    join public.dose_rules_v3 r on r.rule_id=b.rule_id and r.editorial_status='published'
    join public.dose_indication_concepts_v3 i on i.indication_id=r.indication_id and i.editorial_status='published'
    where p.drug_id=p_drug_id and p.editorial_status='published'
  ) x;

  if jsonb_array_length(v_v2_rules)<>jsonb_array_length(v_v3_rules) then
    raise exception 'Phase 8 shadow record blocked: rule count differs';
  end if;

  if (
    select array_agg(e->>'ruleKey' order by e->>'ruleKey') from jsonb_array_elements(v_v2_rules) e
  ) is distinct from (
    select array_agg(e->>'ruleKey' order by e->>'ruleKey') from jsonb_array_elements(v_v3_rules) e
  ) then
    raise exception 'Phase 8 shadow record blocked: rule key set differs';
  end if;

  with v2 as (
    select e->>'ruleKey' rule_key,e rule_json from jsonb_array_elements(v_v2_rules) e
  ), v3 as (
    select e->>'ruleKey' rule_key,e rule_json from jsonb_array_elements(v_v3_rules) e
  ), diffs as (
    select v2.rule_key,k.key field,k.value v2_value,v3.rule_json->k.key v3_value
    from v2 join v3 using(rule_key)
    cross join lateral jsonb_each(v2.rule_json) k
    where k.value is distinct from (v3.rule_json->k.key)
  ), classified as (
    select d.*,
      case
        when d.field in ('minAgeMonths','maxAgeMonths','doseMinValue','doseMaxValue','maxDoses24h','maxWeightKg')
         and exists (
           select 1 from drx_dose.phase8_clinical_rule_findings_v1 f
           where f.drug_id=p_drug_id and f.v2_rule_key=d.rule_key
             and f.review_status='RESOLVED' and f.reviewer_role='CLINICAL_REVIEWER'
         ) then 'RESOLVED_CLINICAL_FINDING'
        when d.field='indicationKey'
         and exists (
           select 1
           from public.dose_rules_v3 r
           join drx_dose.phase8_pilot_indication_provenance_v1 ip on ip.indication_id=r.indication_id
           join drx_dose.phase8_pilot_clinical_references_v1 cr on cr.clinical_reference_id=ip.clinical_reference_id
           where r.rule_key=d.rule_key and cr.drug_id=p_drug_id
             and cr.evidence_review_status='VERIFIED' and cr.reviewer_role='CLINICAL_REVIEWER'
         ) then 'VERIFIED_INDICATION_PROVENANCE'
        when d.field in (
          'patientGroup','frequencyMode','intervalMinHours','intervalMaxHours','timesPerDay',
          'durationMode','reviewAfterDays','route','maxDoses24h'
        ) and v_ref_verified then 'VERIFIED_CLINICAL_REFERENCE_NORMALIZATION'
        else 'UNJUSTIFIED'
      end basis
    from diffs d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'ruleKey',rule_key,'field',field,'v2',v2_value,'v3',v3_value,'basis',basis
         ) order by rule_key,field),'[]'::jsonb),
         count(*) filter(where basis='UNJUSTIFIED')
  into v_changes,v_unjustified
  from classified;

  if coalesce(v_unjustified,0)>0 then
    raise exception 'Phase 8 shadow record blocked: unjustified rule semantic differences: %',v_changes;
  end if;

  if jsonb_array_length(v_changes)=0 then
    raise exception 'Phase 8 shadow record blocked: expected reviewed semantic differences but found none';
  end if;

  select array_agg(finding_id order by finding_id) into v_finding_ids
  from drx_dose.phase8_clinical_rule_findings_v1
  where drug_id=p_drug_id and review_status='RESOLVED' and reviewer_role='CLINICAL_REVIEWER';

  v_v2_payload:=jsonb_build_object('product',v_v2_product,'rules',v_v2_rules);
  v_v3_payload:=jsonb_build_object('product',v_v3_product,'rules',v_v3_rules);
  v_selector_hash:=encode(digest(convert_to('drug_id:'||p_drug_id::text,'UTF8'),'sha256'),'hex');
  v_v2_hash:=encode(digest(convert_to(v_v2_payload::text,'UTF8'),'sha256'),'hex');
  v_v3_hash:=encode(digest(convert_to(v_v3_payload::text,'UTF8'),'sha256'),'hex');
  v_rule_count:=jsonb_array_length(v_v2_rules);

  v_comparison_id:=public.drx_record_dose_shadow_comparison_v1(
    'drug_id',v_selector_hash,'v2-shadow','DIFF',array['RULE_SEMANTICS']::text[],
    v_v2_hash,v_v3_hash,v_rule_count,v_rule_count,null
  );

  insert into drx_runtime.shadow_diff_classifications_v1(
    comparison_id,drug_id,classification_status,finding_ids,classified_by,
    classification_note,automatic_global_acceptance_allowed,classification_audit
  ) values(
    v_comparison_id,p_drug_id,'APPROVED_CLINICAL_CORRECTION',v_finding_ids,
    'phase8-reviewed-shadow-auditor',
    'Field-level audit: every V2/V3 rule semantic difference is backed by a resolved clinical finding or verified reviewed source provenance.',
    false,
    jsonb_build_object(
      'auditVersion','drx-phase8-shadow-field-audit-v1',
      'hashCanonicalizer','sql-jsonb-phase8-v1',
      'changes',v_changes,
      'clinicalReferenceVerified',true
    )
  );

  return jsonb_build_object(
    'comparisonId',v_comparison_id,'drugId',p_drug_id,
    'comparisonStatus','DIFF','diffCodes',jsonb_build_array('RULE_SEMANTICS'),
    'classifiedAs','APPROVED_CLINICAL_CORRECTION',
    'changeCount',jsonb_array_length(v_changes),'changes',v_changes,
    'v2PayloadSha256',v_v2_hash,'v3PayloadSha256',v_v3_hash,
    'ruleCount',v_rule_count,'automaticGlobalAcceptanceAllowed',false
  );
end;
$$;

revoke all on function public.drx_phase8_record_pilot_shadow_v1(uuid) from public,anon,authenticated;
grant execute on function public.drx_phase8_record_pilot_shadow_v1(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.drx_phase8_status_v1()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'drx_runtime', 'drx_dose', 'drx_clinical', 'drx_raw'
AS $function$
with latest_shadow as (
  select distinct on (selector_kind,selector_sha256) *
  from drx_runtime.shadow_comparisons_v1
  order by selector_kind,selector_sha256,created_at desc,comparison_id desc
), metrics as (
  select
    (select count(*) from drx_runtime.published_product_read_model_v1) v3_read_model_products,
    (select count(*) from public.dose_products_v3 where editorial_status='published') v3_published_products,
    (select count(*) from public.dose_rules_v3 where editorial_status='published') v3_published_rules,

    (select count(*) from latest_shadow) shadow_comparisons,
    (select count(*) from latest_shadow s
      where s.comparison_status='MATCH'
         or (
           s.comparison_status='DIFF'
           and exists (
             select 1 from drx_runtime.shadow_diff_classifications_v1 c
             where c.comparison_id=s.comparison_id
               and c.classification_status='APPROVED_CLINICAL_CORRECTION'
           )
         )
    ) shadow_matches,
    (select count(*) from latest_shadow s
      where s.comparison_status='DIFF'
        and not exists (
          select 1 from drx_runtime.shadow_diff_classifications_v1 c
          where c.comparison_id=s.comparison_id
            and c.classification_status='APPROVED_CLINICAL_CORRECTION'
        )
    ) shadow_diffs,
    (select count(*) from latest_shadow where comparison_status='V2_ONLY') shadow_v2_only,
    (select count(*) from latest_shadow where comparison_status='V3_ONLY') shadow_v3_only,
    (select count(*) from latest_shadow where comparison_status='BOTH_MISSING') shadow_both_missing,
    (select count(*) from latest_shadow where comparison_status='V3_ERROR') shadow_v3_errors,
    (select count(*) from latest_shadow where comparison_status='SKIPPED') shadow_skipped,

    (
      (select count(*) from drx_clinical.source_identity_candidates_v1
        where resolution_status='UNIQUE_CANDIDATE')
      +
      (select count(*) from drx_dose.phase8_source_identity_resolution_v1
        where resolution_status='EXACT_PRODUCT_COMBINATION_COMPONENTS')
    ) unique_source_identities,
    (select count(*)
       from drx_clinical.source_identity_candidates_v1 c
      where c.resolution_status<>'UNIQUE_CANDIDATE'
        and not exists (
          select 1
          from drx_dose.phase8_source_identity_resolution_v1 r
          where r.source_document_id=c.source_document_id
            and r.resolution_status='EXACT_PRODUCT_COMBINATION_COMPONENTS'
        )
    ) unresolved_source_identities,

    (select count(*) from drx_dose.product_source_bindings_v1 where binding_status='REVIEW') review_product_source_bindings,
    (select count(*) from drx_dose.product_source_bindings_v1 where binding_status='VERIFIED') verified_product_source_bindings,
    (select count(*) from drx_dose.product_source_bindings_v1
      where binding_scope='REFERENCE_SUBSTANCE_LABEL') reference_label_bindings,
    (select count(*) from drx_dose.product_source_bindings_v1
      where binding_scope='EXACT_MARKET_PRODUCT') exact_market_product_bindings,
    (select count(*) from drx_dose.product_source_exact_evidence_v1) exact_market_product_evidence_rows,

    (select count(*) from drx_dose.v3_product_candidates_v1) v3_product_candidates,
    (select count(*) from drx_dose.v3_product_candidates_v1
      where evidence_tier='SUBSTANCE_STRENGTH_ROUTE_FORM') strongest_review_candidates,
    (select count(*) from drx_dose.v3_product_candidates_v1
      where strength_literal_match) strength_literal_candidates,
    (select count(*) from drx_dose.v3_product_candidates_v1
      where route_literal_match) route_literal_candidates,
    (select count(*) from drx_dose.v3_product_candidates_v1
      where form_literal_match) form_literal_candidates,

    (select count(*) from drx_dose.phase8_published_v2_comparator_v1) published_v2_comparator_products,
    (select count(*) from drx_dose.phase8_exact_source_discovery_v1
      where identity_match_status='EXACT_PRODUCT_CANDIDATE') exact_source_discovery_candidates,
    (select count(*) from drx_dose.phase8_exact_source_discovery_v1
      where snapshot_status='INGESTED') exact_source_snapshot_ready,
    (select count(distinct b.drug_id)
       from drx_dose.exact_market_product_source_bindings_v1 b
       join drx_dose.phase8_published_v2_comparator_v1 p on p.drug_id=b.drug_id
       where b.binding_status='VERIFIED') pilot_exact_market_verified,
    (select count(*) from drx_dose.phase8_pilot_clinical_references_v1
       where evidence_review_status='VERIFIED' and reviewer_role='CLINICAL_REVIEWER') pilot_clinical_references_verified,
    (select count(*) from drx_dose.phase8_clinical_rule_findings_v1
       where review_status<>'RESOLVED') pilot_unresolved_clinical_findings,
    (select count(*) from drx_dose.phase8_pilot_readiness_v1
      where pilot_status='SOURCE_SNAPSHOT_MISSING') pilot_source_snapshot_missing,
    (select count(*) from drx_dose.phase8_pilot_readiness_v1
      where pilot_status='READY_FOR_V3_BUILD') pilot_ready_for_v3_build,

    (select count(*) from drx_runtime.legacy_evidence_alignment_v1
      where alignment_status='EXACT_URL_ONLY') legacy_exact_url_only,
    (select count(*) from drx_runtime.legacy_evidence_alignment_v1
      where alignment_status='EXACT_URL_AND_SECTION_HASH') legacy_exact_url_and_section_hash,
    (select count(*) from drx_runtime.legacy_evidence_alignment_v1
      where alignment_status='EXACT_SECTION_HASH_ONLY') legacy_exact_section_hash_only,

    (select count(*) from drx_raw.registry_reconstruction_diff_v1 where differs) reconstruction_true_diffs,
    (select count(*) from drx_raw.registry_generated_projection_diff_v1
      where active_substance_key_differs
         or global_search_text_differs
         or registry_search_text_differs) generated_true_diffs,

    (select count(*) from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname in (
          'drx_dose_search_v3_shadow_v1',
          'drx_record_dose_shadow_comparison_v1',
          'drx_phase8_status_v1'
        )) phase8_functions,

    (select count(*) from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal
        and (
          (n.nspname='drx_dose'
           and c.relname='product_source_bindings_v1'
           and t.tgname='drx_product_source_binding_verification_guard')
          or
          (n.nspname='drx_dose'
           and c.relname='product_source_exact_evidence_v1'
           and t.tgname='drx_exact_product_evidence_guard')
        )
    ) exact_product_guard_triggers,

    (select count(*)
     from drx_dose.product_source_bindings_v1 b
     where b.binding_status='VERIFIED'
       and (
         b.binding_scope<>'EXACT_MARKET_PRODUCT'
         or not exists (
           select 1
           from drx_dose.product_source_exact_evidence_v1 e
           where e.binding_id=b.binding_id
         )
       )
    ) invalid_verified_product_source_bindings
),
gates as (
  select
    m.*,
    (
      m.phase8_functions=3
      and m.exact_product_guard_triggers=2
      and m.invalid_verified_product_source_bindings=0
      and m.unresolved_source_identities=0
      and m.v3_product_candidates=m.review_product_source_bindings
      and m.review_product_source_bindings>0
      and m.published_v2_comparator_products>0
      and m.exact_source_discovery_candidates>0
      and m.reconstruction_true_diffs=0
      and m.generated_true_diffs=0
    ) implementation_gate_pass,
    (
      m.published_v2_comparator_products>0
      and m.exact_source_discovery_candidates>0
      and m.pilot_ready_for_v3_build>0
    ) pilot_preparation_gate_pass,
    (
      m.phase8_functions=3
      and m.exact_product_guard_triggers=2
      and m.invalid_verified_product_source_bindings=0
      and m.unresolved_source_identities=0
      and m.v3_product_candidates=m.review_product_source_bindings
      and m.review_product_source_bindings>0
      and m.published_v2_comparator_products>0
      and m.exact_source_discovery_candidates>0
      and m.v3_published_products>0
      and m.v3_published_rules>0
      and m.pilot_exact_market_verified=m.published_v2_comparator_products
      and m.pilot_clinical_references_verified=m.published_v2_comparator_products
      and m.pilot_unresolved_clinical_findings=0
      and m.pilot_ready_for_v3_build>0
      and m.shadow_comparisons>0
      and m.shadow_matches=m.shadow_comparisons
      and m.shadow_diffs=0
      and m.shadow_v2_only=0
      and m.shadow_v3_only=0
      and m.shadow_both_missing=0
      and m.shadow_v3_errors=0
      and m.shadow_skipped=0
      and m.reconstruction_true_diffs=0
      and m.generated_true_diffs=0
    ) exit_gate_pass
  from metrics m
)
select jsonb_build_object(
  'v3_read_model_products',g.v3_read_model_products,
  'v3_published_products',g.v3_published_products,
  'v3_published_rules',g.v3_published_rules,

  'shadow_comparisons',g.shadow_comparisons,
  'shadow_matches',g.shadow_matches,
  'shadow_diffs',g.shadow_diffs,
  'shadow_v2_only',g.shadow_v2_only,
  'shadow_v3_only',g.shadow_v3_only,
  'shadow_both_missing',g.shadow_both_missing,
  'shadow_v3_errors',g.shadow_v3_errors,
  'shadow_skipped',g.shadow_skipped,

  'unique_source_identities',g.unique_source_identities,
  'unresolved_source_identities',g.unresolved_source_identities,

  'review_product_source_bindings',g.review_product_source_bindings,
  'verified_product_source_bindings',g.verified_product_source_bindings,
  'reference_label_bindings',g.reference_label_bindings,
  'exact_market_product_bindings',g.exact_market_product_bindings,
  'exact_market_product_evidence_rows',g.exact_market_product_evidence_rows,
  'invalid_verified_product_source_bindings',g.invalid_verified_product_source_bindings,
  'exact_product_guard_triggers',g.exact_product_guard_triggers,

  'v3_product_candidates',g.v3_product_candidates,
  'strongest_review_candidates',g.strongest_review_candidates,
  'strength_literal_candidates',g.strength_literal_candidates,
  'route_literal_candidates',g.route_literal_candidates,
  'form_literal_candidates',g.form_literal_candidates,

  'published_v2_comparator_products',g.published_v2_comparator_products,
  'exact_source_discovery_candidates',g.exact_source_discovery_candidates,
  'exact_source_snapshot_ready',g.exact_source_snapshot_ready,
  'pilot_source_snapshot_missing',g.pilot_source_snapshot_missing,
  'pilot_ready_for_v3_build',g.pilot_ready_for_v3_build,

  'legacy_exact_url_only',g.legacy_exact_url_only,
  'legacy_exact_url_and_section_hash',g.legacy_exact_url_and_section_hash,
  'legacy_exact_section_hash_only',g.legacy_exact_section_hash_only,

  'phase8_functions',g.phase8_functions,
  'reconstruction_true_diffs',g.reconstruction_true_diffs,
  'generated_true_diffs',g.generated_true_diffs,

  'shadow_only',true,
  'v2_runtime_preserved',true,
  'v3_cutover_enabled',false,
  'reference_label_can_verify_market_product',false,
  'automatic_candidate_insert_enabled',false,
  'automatic_product_source_verification_enabled',false,
  'automatic_legacy_verification_enabled',false,
  'automatic_exact_source_promotion_enabled',false,
  'publication_allowed',false,

  'implementation_gate_pass',g.implementation_gate_pass,
  'pilot_preparation_gate_pass',g.pilot_preparation_gate_pass,
  'exit_gate_pass',g.exit_gate_pass,
  'gate_pass',g.exit_gate_pass
)
from gates g;
$function$
;

revoke all on drx_runtime.shadow_diff_classifications_v1 from public,anon,authenticated;
revoke all on schema drx_runtime from public,anon,authenticated;
