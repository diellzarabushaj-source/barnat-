-- Batch 2 exact product binding feasibility.
--
-- Answers one question before any binding is attempted: for each Batch 2
-- substance, does the Kosovo registry actually carry a product at the strength
-- the chosen SmPC describes?
--
-- This matters because dose_products_v3 stores numerator_value/denominator_value
-- and the dose engine calculates from them. Binding a rule read from an 80 mg
-- SmPC to a 40 mg product does not produce a missing dose, it produces a wrong
-- one. So a substance with zero exact-strength products must stay unbound.
--
-- Joins through the canonical layer rather than drugs.active_substance_key, so
-- salt forms resolve: the registry keys "bisoprololfumarate" where the SmPC
-- canonical key is "bisoprolol". A concept_found=false row is a base/salt
-- equivalence gap, not proof the medicine is absent.
--
-- Result recorded in data/drx-batch2-product-binding-feasibility-v1.json.

with batch(ckey, strength, form) as (values
  ('amlodipine','5 mg','tablet'),
  ('atorvastatin','80 mg','film-coated tablet'),
  ('bisoprolol','10 mg','film-coated tablet'),
  ('losartan','12.5 mg','film-coated tablet'),
  ('pantoprazole','40 mg','gastro-resistant tablet'),
  ('ciprofloxacin','250 mg','film-coated tablet'),
  ('furosemide','10 mg/mL','solution for injection/infusion'),
  ('prednisolone','5 mg','soluble tablet'),
  ('dexamethasone','2 mg','soluble tablet'),
  ('cetirizine','10 mg','film-coated tablet'),
  ('levothyroxine','50 micrograms','tablet'),
  ('ondansetron','4 mg','film-coated tablet'),
  ('carvedilol','25 mg','film-coated tablet'),
  ('tramadol','50 mg','hard capsule'),
  ('aspirin','75 mg','tablet'),
  ('ramipril','5 mg','tablet'),
  ('clopidogrel','75 mg','film-coated tablet'),
  ('naproxen','500 mg','tablet'),
  ('spironolactone','12.5 mg','film-coated tablet'),
  ('diclofenac','100 mg','prolonged-release tablet'),
  ('doxycycline','100 mg','hard capsule'),
  ('cefalexin','250 mg','capsule'),
  ('metronidazole','500 mg','film-coated tablet'),
  ('gliclazide','40 mg','tablet'),
  ('loratadine','10 mg','tablet')
),
concept as (
  select b.ckey, b.strength, c.concept_id
  from batch b
  left join public.substance_concepts_v1 c on c.canonical_key = b.ckey
),
linked as (
  select co.ckey, co.strength, co.concept_id, d.id as drug_id, d.strength as drug_strength
  from concept co
  left join public.product_ingredients_v1 pi on pi.concept_id = co.concept_id
  left join public.drugs d on d.id = pi.source_drug_id
)
select
  ckey,
  strength as smpc_strength,
  (concept_id is not null) as concept_found,
  count(drug_id) as kosovo_products,
  count(drug_id) filter (
    where replace(replace(lower(drug_strength), ' ', ''), 'micrograms', 'mcg')
        = replace(replace(lower(strength), ' ', ''), 'micrograms', 'mcg')
  ) as exact_strength_products
from linked
group by ckey, strength, concept_id
order by exact_strength_products desc, ckey;
