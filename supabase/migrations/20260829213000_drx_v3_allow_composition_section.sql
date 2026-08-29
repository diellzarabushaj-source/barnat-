-- Allow SmPC section 2 to be archived alongside the clinical sections.
-- version: 20260829213000
-- name: drx_v3_allow_composition_section
--
-- The salt and strength basis of a medicine is declared in section 2
-- (qualitative and quantitative composition) and nowhere else in the label.
-- Until now dose_source_sections_v3 constrained section_code to ^4\.[1-9]$, so
-- section 2 could not be stored even once the parser could read it. That left
-- base-to-salt equivalences such as bisoprolol to bisoprolol fumarate provable
-- only by convention, never by archived evidence.
--
-- This widens storage only. It does not widen what may be dosed from:
-- dose_rules_v3.source_section, dose_renal_adjustments_v3.source_section and
-- dose_hepatic_adjustments_v3.source_section all keep check (source_section =
-- '4.2'), and every publication guard and RLS policy pins section_code = '4.2'
-- explicitly rather than matching a pattern. A rule can therefore never cite
-- section 2 as its dosing source.

alter table public.dose_source_sections_v3
  drop constraint if exists dose_source_sections_v3_section_code_check;

alter table public.dose_source_sections_v3
  add constraint dose_source_sections_v3_section_code_check
  check (section_code ~ '^(?:2|4\.[1-9])$');

comment on constraint dose_source_sections_v3_section_code_check
  on public.dose_source_sections_v3 is
  'Clinical sections 4.1-4.9 plus composition section 2. Section 2 is stored for salt/strength provenance only; dosing sources stay pinned to 4.2 by dose_rules_v3 and the adjustment tables.';
