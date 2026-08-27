-- Synced from Supabase production migration history.
-- version: 20260827145710
-- name: p1_base_ingredient_identities

insert into public.substance_concepts_v1
(concept_id,canonical_key,canonical_name,concept_kind,source_method)
values
(public.medindex_stable_uuid_v1('substance','salmeterol'),'salmeterol','Salmeterol','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','enalapril'),'enalapril','Enalapril','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','lercanidipine'),'lercanidipine','Lercanidipine','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','piperacillin'),'piperacillin','Piperacillin','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','tazobactam'),'tazobactam','Tazobactam','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','thiaminenitrate'),'thiaminenitrate','Thiamine nitrate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','sodiumhydroxide'),'sodiumhydroxide','Sodium hydroxide','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','disodiumphosphatedodecahydrate'),'disodiumphosphatedodecahydrate','Disodium phosphate dodecahydrate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','magnesiumacetatetetrahydrate'),'magnesiumacetatetetrahydrate','Magnesium acetate tetrahydrate','INGREDIENT','OFFICIAL_REFERENCE'),
(public.medindex_stable_uuid_v1('substance','triglyceridesmediumchain'),'triglyceridesmediumchain','Triglycerides, medium chain','INGREDIENT','OFFICIAL_REFERENCE')
on conflict (canonical_key) do update
set canonical_name=excluded.canonical_name,
    source_method=excluded.source_method,
    updated_at=now();

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('salmeterol',public.medindex_stable_uuid_v1('substance','salmeterol'),'Salmeterol','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/search?q=salmeterol']),
('enalapril',public.medindex_stable_uuid_v1('substance','enalapril'),'Enalapril','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/search?q=enalapril']),
('lercanidipine',public.medindex_stable_uuid_v1('substance','lercanidipine'),'Lercanidipine','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://www.medicines.org.uk/emc/search?q=lercanidipine']),
('piperacillin',public.medindex_stable_uuid_v1('substance','piperacillin'),'Piperacillin','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=PIPERACILLIN']),
('tazobactam',public.medindex_stable_uuid_v1('substance','tazobactam'),'Tazobactam','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=TAZOBACTAM']),
('thiaminenitrate',public.medindex_stable_uuid_v1('substance','thiaminenitrate'),'Thiamine nitrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=THIAMINE+MONONITRATE']),
('sodiumhydroxide',public.medindex_stable_uuid_v1('substance','sodiumhydroxide'),'Sodium hydroxide','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=SODIUM+HYDROXIDE']),
('disodiumphosphatedodecahydrate',public.medindex_stable_uuid_v1('substance','disodiumphosphatedodecahydrate'),'Disodium Phosphate Dodecahydrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=SODIUM+PHOSPHATE+DIBASIC+DODECAHYDRATE']),
('magnesiumacetatetetrahydrate',public.medindex_stable_uuid_v1('substance','magnesiumacetatetetrahydrate'),'Magnesium acetate tetrahydrate','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=MAGNESIUM+ACETATE+TETRAHYDRATE']),
('triglyceridesmediumchain',public.medindex_stable_uuid_v1('substance','triglyceridesmediumchain'),'Triglycerides, medium chain','CANONICAL',true,1.0000,'OFFICIAL_REFERENCE',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=MEDIUM+CHAIN+TRIGLYCERIDES']),
('epinephrine',public.medindex_stable_uuid_v1('substance','adrenalineepinephrine'),'Epinephrine','ALIAS',false,1.0000,'OFFICIAL_SYNONYM_EXPRESSION',array['https://www.medicines.org.uk/emc/search?q=adrenaline']),
('lisinoprildehydrate',public.medindex_stable_uuid_v1('substance','lisinoprildihydrate'),'Lisinopril dehydrate','ALIAS',false,0.9990,'ORTHOGRAPHIC_VARIANT_REVIEW',array['https://www.medicines.org.uk/emc/search?q=lisinopril']),
('formoterolfumaratedehydrous',public.medindex_stable_uuid_v1('substance','formoterolfumaratedihydrate'),'formoterol fumarate dehydrous','ALIAS',false,0.9990,'ORTHOGRAPHIC_VARIANT_REVIEW',array['https://www.medicines.org.uk/emc/search?q=beclometasone+formoterol']),
('piperacillinsodim',public.medindex_stable_uuid_v1('substance','piperacillinsodium'),'Piperacillin sodim','ALIAS',false,0.9990,'ORTHOGRAPHIC_VARIANT_REVIEW',array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=PIPERACILLIN+SODIUM'])
on conflict (term_key) do update
set concept_id=excluded.concept_id,
    term=excluded.term,
    term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,
    confidence=excluded.confidence,
    review_method=excluded.review_method,
    evidence_urls=excluded.evidence_urls,
    updated_at=now();

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
values
('epinephrine','adrenalineepinephrine','Adrenaline (epinephrine)','epinephrine is the USAN name for the same base substance as adrenaline','p1-base-identity-batch-2026-08-27',now(),'official_synonym_expression',1.0000,array['https://www.medicines.org.uk/emc/search?q=adrenaline']),
('lisinoprildehydrate','lisinoprildihydrate','Lisinopril Dihydrate','dehydrate is a misspelling of dihydrate; hydration state unchanged','p1-base-identity-batch-2026-08-27',now(),'orthographic_variant_review',0.9990,array['https://www.medicines.org.uk/emc/search?q=lisinopril']),
('formoterolfumaratedehydrous','formoterolfumaratedihydrate','Formoterol fumarate dihydrate','dehydrous is a misspelling of dihydrate; the sibling product spells the same component dehydrate','p1-base-identity-batch-2026-08-27',now(),'orthographic_variant_review',0.9990,array['https://www.medicines.org.uk/emc/search?q=beclometasone+formoterol']),
('piperacillinsodim','piperacillinsodium','Piperacillin sodium','sodim is a misspelling of sodium','p1-base-identity-batch-2026-08-27',now(),'orthographic_variant_review',0.9990,array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=PIPERACILLIN+SODIUM'])
on conflict (variant_key) do nothing;

insert into public.substance_merge_rejections
(key_a,key_b,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
select least(a,b),greatest(a,b),reason,
       'p1-base-identity-guard-2026-08-27',now(),
       'precise_ingredient_guard',1.0000,evidence
from (values
('salmeterol','salmeterolxinafoate','base and xinafoate salt are separate ingredient identities',
 array['https://www.medicines.org.uk/emc/search?q=salmeterol']::text[]),
('enalapril','enalaprilmaleate','base and maleate salt are separate ingredient identities',
 array['https://www.medicines.org.uk/emc/search?q=enalapril']::text[]),
('lercanidipine','lercanidipinehydrochloride','base and hydrochloride salt are separate ingredient identities',
 array['https://www.medicines.org.uk/emc/search?q=lercanidipine']::text[]),
('piperacillin','piperacillinsodium','base and sodium salt are separate ingredient identities',
 array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=PIPERACILLIN']::text[]),
('tazobactam','tazobactamsodium','base and sodium salt are separate ingredient identities',
 array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=TAZOBACTAM']::text[]),
('thiaminenitrate','thiaminehydrochloride','different thiamine salts; no automatic merge',
 array['https://dailymed.nlm.nih.gov/dailymed/search.cfm?adv=1&labeltype=human&query=THIAMINE+MONONITRATE']::text[]),
('adrenalineepinephrine','epinephrinebitartrate','base and bitartrate salt are separate ingredient identities',
 array['https://www.medicines.org.uk/emc/search?q=adrenaline']::text[]),
('adrenalineacidtartrate','adrenalineepinephrine','base and acid tartrate salt are separate ingredient identities',
 array['https://www.medicines.org.uk/emc/search?q=adrenaline']::text[])
) v(a,b,reason,evidence)
on conflict (key_a,key_b) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 276 then
    raise exception 'P1.19 base identity batch did not improve review coverage: %',n;
  end if;
end $$;
