-- Synced from Supabase production migration history.
-- version: 20260827144343
-- name: p1_explicit_expression_normalization

insert into public.substance_terms_v1
(term_key,concept_id,term,term_type,is_preferred,confidence,review_method,evidence_urls)
values
('atorvastatinasatorvastatincalciumtrihydrate',public.medindex_stable_uuid_v1('substance','atorvastatincalciumtrihydrate'),'Atorvastatin (as atorvastatin calcium trihydrate)','ALIAS',false,1.0000,'EXPLICIT_SOURCE_EXPRESSION','{}'),
('potassiumclavulanatediluted',public.medindex_stable_uuid_v1('substance','clavulanatepotassium'),'Potassium clavulanate, diluted','ALIAS',false,1.0000,'FORMULATION_DESCRIPTOR_NORMALIZATION','{}'),
('amlodipinebesilate2amlodipinefreebase',public.medindex_stable_uuid_v1('substance','amlodipinebesilate'),'Amlodipine besilate (Amlodipine free base)','ALIAS',false,1.0000,'BASIS_OF_STRENGTH_EXPRESSION','{}'),
('amlodipineinformofamlodipinebesilate',public.medindex_stable_uuid_v1('substance','amlodipinebesilate'),'Amlodipine in form of Amlodipine besilate','ALIAS',false,1.0000,'EXPLICIT_SOURCE_EXPRESSION','{}'),
('amlodipineinformofamlodipinebesilate1387mg',public.medindex_stable_uuid_v1('substance','amlodipinebesilate'),'Amlodipine in form of Amlodipine besilate (13.87 mg)','ALIAS',false,1.0000,'EXPLICIT_SOURCE_EXPRESSION','{}'),
('atorvastatininformofatorvastatincalciumtrihydrate',public.medindex_stable_uuid_v1('substance','atorvastatincalciumtrihydrate'),'Atorvastatin in form of Atorvastatin calcium trihydrate','ALIAS',false,1.0000,'EXPLICIT_SOURCE_EXPRESSION','{}'),
('mixtureofpotassiumclavulanate',public.medindex_stable_uuid_v1('substance','clavulanatepotassium'),'Mixture of Potassium Clavulanate','ALIAS',false,1.0000,'FORMULATION_DESCRIPTOR_NORMALIZATION','{}'),
('potassiumclavulanatewithsyloid11',public.medindex_stable_uuid_v1('substance','clavulanatepotassium'),'Potassium clavulanate with syloid (1:1)','ALIAS',false,1.0000,'FORMULATION_DESCRIPTOR_NORMALIZATION','{}'),
('amlodipineusedasamlodipinebesilate1388mg',public.medindex_stable_uuid_v1('substance','amlodipinebesilate'),'Amlodipine used as Amlodipine besilate (13.88 mg)','ALIAS',false,1.0000,'EXPLICIT_SOURCE_EXPRESSION','{}'),
('atorvastatininformofatorvastatincalciumtrihydrate108500',public.medindex_stable_uuid_v1('substance','atorvastatincalciumtrihydrate'),'Atorvastatin in form of Atorvastatin calcium trihydrate (10.8500)','ALIAS',false,1.0000,'EXPLICIT_SOURCE_EXPRESSION','{}'),
('atorvastatininformofatorvastatincalciumtrihydrate1085mg',public.medindex_stable_uuid_v1('substance','atorvastatincalciumtrihydrate'),'Atorvastatin in form of Atorvastatin calcium trihydrate (10.85 mg)','ALIAS',false,1.0000,'EXPLICIT_SOURCE_EXPRESSION','{}'),
('clavulanicacidaspotassiumclavulanate',public.medindex_stable_uuid_v1('substance','clavulanatepotassium'),'Clavulanic acid as potassium clavulanate','ALIAS',false,1.0000,'BASIS_OF_STRENGTH_EXPRESSION','{}')
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
('atorvastatinasatorvastatincalciumtrihydrate','atorvastatincalciumtrihydrate','Atorvastatin calcium trihydrate','source explicitly states atorvastatin as atorvastatin calcium trihydrate','p1-expression-normalization-2026-08-27',now(),'explicit_source_expression',1.0000,'{}'),
('potassiumclavulanatediluted','clavulanatepotassium','Clavulanate potassium','diluted is a formulation descriptor; precise active remains potassium clavulanate','p1-expression-normalization-2026-08-27',now(),'formulation_descriptor_normalization',1.0000,'{}'),
('amlodipinebesilate2amlodipinefreebase','amlodipinebesilate','Amlodipine besilate','source names amlodipine besilate and expresses strength on free-base basis','p1-expression-normalization-2026-08-27',now(),'basis_of_strength_expression',1.0000,'{}'),
('amlodipineinformofamlodipinebesilate','amlodipinebesilate','Amlodipine besilate','source explicitly states amlodipine in form of amlodipine besilate','p1-expression-normalization-2026-08-27',now(),'explicit_source_expression',1.0000,'{}'),
('amlodipineinformofamlodipinebesilate1387mg','amlodipinebesilate','Amlodipine besilate','source explicitly states amlodipine in form of amlodipine besilate; numeric text is strength','p1-expression-normalization-2026-08-27',now(),'explicit_source_expression',1.0000,'{}'),
('atorvastatininformofatorvastatincalciumtrihydrate','atorvastatincalciumtrihydrate','Atorvastatin calcium trihydrate','source explicitly states atorvastatin in form of atorvastatin calcium trihydrate','p1-expression-normalization-2026-08-27',now(),'explicit_source_expression',1.0000,'{}'),
('mixtureofpotassiumclavulanate','clavulanatepotassium','Clavulanate potassium','mixture wording is formulation context; active identity is potassium clavulanate','p1-expression-normalization-2026-08-27',now(),'formulation_descriptor_normalization',1.0000,'{}'),
('potassiumclavulanatewithsyloid11','clavulanatepotassium','Clavulanate potassium','syloid and ratio describe formulation carrier, not a different active ingredient','p1-expression-normalization-2026-08-27',now(),'formulation_descriptor_normalization',1.0000,'{}'),
('amlodipineusedasamlodipinebesilate1388mg','amlodipinebesilate','Amlodipine besilate','source explicitly states amlodipine used as amlodipine besilate; numeric text is strength','p1-expression-normalization-2026-08-27',now(),'explicit_source_expression',1.0000,'{}'),
('atorvastatininformofatorvastatincalciumtrihydrate108500','atorvastatincalciumtrihydrate','Atorvastatin calcium trihydrate','source explicitly states atorvastatin in form of atorvastatin calcium trihydrate; numeric text is strength','p1-expression-normalization-2026-08-27',now(),'explicit_source_expression',1.0000,'{}'),
('atorvastatininformofatorvastatincalciumtrihydrate1085mg','atorvastatincalciumtrihydrate','Atorvastatin calcium trihydrate','source explicitly states atorvastatin in form of atorvastatin calcium trihydrate; numeric text is strength','p1-expression-normalization-2026-08-27',now(),'explicit_source_expression',1.0000,'{}'),
('clavulanicacidaspotassiumclavulanate','clavulanatepotassium','Clavulanate potassium','source explicitly identifies potassium clavulanate as the administered salt; clavulanic acid is basis of strength','p1-expression-normalization-2026-08-27',now(),'basis_of_strength_expression',1.0000,'{}')
on conflict (variant_key) do nothing;

select public.medindex_refresh_product_ingredients_v1();

do $$
declare n bigint;
begin
  select count(*) into n
  from public.product_ingredient_resolution_v1
  where resolution_status='NEEDS_REVIEW';
  if n >= 295 then
    raise exception 'P1.17 expression normalization did not improve review coverage: %',n;
  end if;
end $$;
