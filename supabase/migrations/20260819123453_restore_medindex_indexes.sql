-- Synced from Supabase production migration history.
-- version: 20260819123453
-- name: restore_medindex_indexes

CREATE INDEX dosage_lookup_idx ON public.dosage_regimens USING btree (drug_id, population, editorial_status);
CREATE INDEX dose_indications_v2_group_idx ON public.dose_indications_v2 USING btree (patient_group, active) WHERE (active = true);
CREATE INDEX dose_indications_v2_substance_idx ON public.dose_indications_v2 USING btree (lower(active_substance));
CREATE INDEX dose_products_v2_group_idx ON public.dose_products_v2 USING btree (patient_group, active) WHERE (active = true);
CREATE INDEX dose_products_v2_substance_idx ON public.dose_products_v2 USING btree (lower(active_substance));
CREATE INDEX dose_rule_products_v2_rule_idx ON public.dose_rule_products_v2 USING btree (rule_key, preferred DESC) WHERE (active = true);
CREATE INDEX dose_rules_v2_match_idx ON public.dose_rules_v2 USING btree (indication_key, patient_group, active) WHERE (active = true);
CREATE INDEX dose_safety_v2_product_idx ON public.dose_safety_v2 USING btree (product_key, indication_key, severity) WHERE (active = true);
CREATE INDEX dose_safety_v2_status_idx ON public.dose_safety_v2 USING btree (editorial_status, active) WHERE (active = true);
CREATE INDEX dose_safety_v2_substance_idx ON public.dose_safety_v2 USING btree (lower(active_substance), route, severity) WHERE (active = true);
CREATE INDEX drug_clinical_profiles_status_idx ON public.drug_clinical_profiles USING btree (verification_status, updated_at DESC);
CREATE INDEX drug_clinical_profiles_updated_idx ON public.drug_clinical_profiles USING btree (updated_at DESC);
CREATE INDEX indications_lookup_idx ON public.drug_indications USING btree (drug_id, population, editorial_status);
CREATE INDEX drugs_search_idx ON public.drugs USING gin (to_tsvector('simple'::regconfig, ((((((COALESCE(trade_name, ''::text) || ' '::text) || COALESCE(active_substance, ''::text)) || ' '::text) || COALESCE(atc_code, ''::text)) || ' '::text) || COALESCE(use_text, ''::text))));
CREATE INDEX icd_search_idx ON public.icd_codes USING gin (to_tsvector('simple'::regconfig, ((((((code || ' '::text) || title_sq) || ' '::text) || COALESCE(title_en, ''::text)) || ' '::text) || COALESCE(description_sq, ''::text))));
CREATE INDEX icd_hierarchy_nodes_block_idx ON public.icd_hierarchy_nodes USING btree (revision, block_code, source_row);
CREATE INDEX icd_hierarchy_nodes_chapter_idx ON public.icd_hierarchy_nodes USING btree (revision, chapter_code, source_row);
CREATE INDEX icd_hierarchy_nodes_code_idx ON public.icd_hierarchy_nodes USING btree (code);
CREATE INDEX icd_hierarchy_nodes_level_idx ON public.icd_hierarchy_nodes USING btree (revision, level_name, source_row);
CREATE INDEX icd_hierarchy_nodes_parent_idx ON public.icd_hierarchy_nodes USING btree (revision, parent_code, source_row);
CREATE UNIQUE INDEX icd_hierarchy_one_active_revision ON public.icd_hierarchy_revisions USING btree (status) WHERE (status = 'active'::text);
CREATE INDEX lab_search_idx ON public.lab_tests USING gin (to_tsvector('simple'::regconfig, ((((((form_name || ' '::text) || COALESCE(full_name_en, ''::text)) || ' '::text) || COALESCE(full_name_sq, ''::text)) || ' '::text) || COALESCE(what_it_shows, ''::text))));
CREATE INDEX medindex_core_product_idx ON public.medindex_drug_core_map_v1 USING btree (product_identity_id);
CREATE INDEX medindex_core_scope_gate_idx ON public.medindex_drug_core_map_v1 USING btree (registry_scope, publication_gate);
CREATE INDEX medindex_core_substance_idx ON public.medindex_drug_core_map_v1 USING btree (substance_concept_id);
