-- Synced from Supabase production migration history.
-- version: 20260827144718
-- name: p1_deterministic_alias_cleanup

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('tazobactamassodiumsalt',public.medindex_stable_uuid_v1('substance','tazobactamsodium'),'Tazobactam (as sodium salt)','ALIAS',false,1.0000,'EXPLICIT_SALT_EXPRESSION','{}'),
('24dichlorbenzylumalcoholum',public.medindex_stable_uuid_v1('substance','24dichlorobenzylalcohol'),'2,4-dichlorbenzylum alcoholum','ALIAS',false,0.9990,'LATINIZED_ORTHOGRAPHIC_VARIANT','{}'),
('amilmetacresolum',public.medindex_stable_uuid_v1('substance','amylmetacresol'),'Amilmetacresolum','ALIAS',false,0.9990,'LATINIZED_ORTHOGRAPHIC_VARIANT','{}'),
('amoxicillinasamoxicillintrihydrate',public.medindex_stable_uuid_v1('substance','amoxicillintrihydrate'),'Amoxicillin (as amoxicillin trihydrate)','ALIAS',false,1.0000,'EXPLICIT_SOURCE_EXPRESSION','{}'),
('amoxycillinetrihydrate',public.medindex_stable_uuid_v1('substance','amoxicillintrihydrate'),'Amoxycilline (trihydrate)','ALIAS',false,0.9990,'ORTHOGRAPHIC_VARIANT_REVIEW','{}'),
('ascorbicacidvitaminc',public.medindex_stable_uuid_v1('substance','ascorbicacid'),'Ascorbic acid (vitamin C)','ALIAS',false,1.0000,'OFFICIAL_SYNONYM_EXPRESSION','{}')
on conflict (term_key) do update
set concept_id=excluded.concept_id,
    term=excluded.term,
    term_type=excluded.term_type,
    is_preferred=excluded.is_preferred,
    confidence=excluded.confidence,
    review_method=excluded.review_method,
    updated_at=now();

insert into public.substance_aliases
(variant_key,canonical_key,canonical_name,reason,decided_by,reviewed_at,review_method,confidence,evidence_urls)
values
('tazobactamassodiumsalt','tazobactamsodium','Tazobactam sodium','source explicitly states tazobactam as sodium salt','p1-deterministic-alias-batch-2026-08-27',now(),'explicit_salt_expression',1.0000,'{}'),
('24dichlorbenzylumalcoholum','24dichlorobenzylalcohol','2,4-Dichlorobenzyl alcohol','Latinized spelling variant only','p1-deterministic-alias-batch-2026-08-27',now(),'latinized_orthographic_variant',0.9990,'{}'),
('amilmetacresolum','amylmetacresol','Amylmetacresol','Latinized spelling variant only','p1-deterministic-alias-batch-2026-08-27',now(),'latinized_orthographic_variant',0.9990,'{}'),
('amoxicillinasamoxicillintrihydrate','amoxicillintrihydrate','Amoxicillin trihydrate','source explicitly states amoxicillin as amoxicillin trihydrate','p1-deterministic-alias-batch-2026-08-27',now(),'explicit_source_expression',1.0000,'{}'),
('amoxycillinetrihydrate','amoxicillintrihydrate','Amoxicillin trihydrate','orthographic variant only; trihydrate state unchanged','p1-deterministic-alias-batch-2026-08-27',now(),'orthographic_variant_review',0.9990,'{}'),
('ascorbicacidvitaminc','ascorbicacid','Ascorbic acid','Vitamin C is the accepted synonym already linked to ascorbic acid','p1-deterministic-alias-batch-2026-08-27',now(),'official_synonym_expression',1.0000,'{}')
on conflict (variant_key) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 281 then
    raise exception 'P1.18 deterministic alias batch did not improve review coverage: %',n;
  end if;
end $$;
