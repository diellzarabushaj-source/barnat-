
-- DRx Phase 11M: capture high-priority ceftriaxone emc SmPC evidence.
-- Source is stored as a normalized, source-backed text capture, not byte-identical HTML.

with payload as (
  select
    $raw$Source: emc product 102127
Title: Ceftriaxone 1 g powder for solution for injection/infusion
Active ingredient shown by emc: ceftriaxone sodium
ATC: J01DD04
Last updated on emc: 01 May 2026
URL: https://www.medicines.org.uk/emc/product/102127/smpc

Section 2 composition:
Each vial contains 1 g ceftriaxone as ceftriaxone sodium. The 1 g vial contains 83 mg sodium (3.6 mmol).

Section 4.1 therapeutic indications:
Ceftriaxone is indicated in adults and children, including term neonates from birth, for bacterial meningitis, community- and hospital-acquired pneumonia, acute otitis media, intra-abdominal infection, complicated UTI including pyelonephritis, bone/joint infection, complicated skin/soft-tissue infection, gonorrhoea, syphilis and bacterial endocarditis, with additional listed uses including COPD exacerbation, disseminated Lyme borreliosis, surgical prophylaxis, neutropenic fever and bacteraemia associated with listed infections.

Section 4.2 normalized posology extract:
Adults and children over 12 years (>=50 kg): 1-2 g once daily for community-acquired pneumonia, COPD exacerbation, intra-abdominal infection and complicated UTI; 2 g once daily for hospital-acquired pneumonia, complicated skin/soft-tissue infection and bone/joint infection; 2-4 g once daily for neutropenic fever, bacterial endocarditis and bacterial meningitis. Doses above 2 g/day may be divided every 12 hours.
Acute otitis media: single IM 1-2 g; selected severe/failed cases 1-2 g daily for 3 days.
Surgical prophylaxis: 2 g single pre-operative dose.
Gonorrhoea: 500 mg single IM dose.
Syphilis: 500 mg-1 g once daily, up to 2 g once daily for neurosyphilis, for 10-14 days.
Disseminated Lyme borreliosis: 2 g once daily for 14-21 days.
Children 15 days-12 years under 50 kg: 50-80 mg/kg once daily for intra-abdominal infection, complicated UTI, community/hospital pneumonia; 50-100 mg/kg once daily (max 4 g) for complicated skin/soft-tissue, bone/joint infection and neutropenic fever; 80-100 mg/kg once daily (max 4 g) for bacterial meningitis; 100 mg/kg once daily (max 4 g) for bacterial endocarditis.
Paediatric acute otitis media: 50 mg/kg single IM dose; selected severe/failed cases 50 mg/kg daily for 3 days.
Paediatric surgical prophylaxis: 50-80 mg/kg single pre-operative dose.
Paediatric syphilis: 75-100 mg/kg once daily (max 4 g) for 10-14 days.
Paediatric Lyme: 50-80 mg/kg once daily for 14-21 days.
Neonates 0-14 days: 20-50 mg/kg once daily for listed infections; 50 mg/kg once daily for meningitis/endocarditis; max daily dose 50 mg/kg. Premature neonates up to postmenstrual age 41 weeks are contraindicated.
Renal: generally no reduction if hepatic function is not impaired; in preterminal renal failure (CrCl <10 mL/min), do not exceed 2 g/day. No supplementary dose after dialysis.
Administration: IV infusion >=30 min preferred, slow IV injection over 5 min, or deep IM. IV doses >=50 mg/kg in infants/children <=12 years should be infused; neonatal IV doses over 60 min.$raw$::text as raw_text,

    $s2$Each vial contains 1 g ceftriaxone as ceftriaxone sodium. Each 1 g vial contains 83 mg sodium (3.6 mmol).$s2$::text as section_2,

    $s41$Ceftriaxone is indicated in adults and children, including term neonates from birth, for bacterial meningitis, community-acquired pneumonia, hospital-acquired pneumonia, acute otitis media, intra-abdominal infections, complicated urinary tract infections including pyelonephritis, infections of bones and joints, complicated skin and soft-tissue infections, gonorrhoea, syphilis and bacterial endocarditis. Additional listed uses include acute COPD exacerbations in adults, disseminated Lyme borreliosis, pre-operative prophylaxis of surgical-site infection, neutropenic fever suspected due to bacterial infection, and bacteraemia associated with listed infections.$s41$::text as section_41,

    $s42$Adults and children over 12 years (>=50 kg): 1-2 g once daily for community-acquired pneumonia, COPD exacerbation, intra-abdominal infection and complicated UTI; 2 g once daily for hospital-acquired pneumonia, complicated skin/soft-tissue infection and bone/joint infection; 2-4 g once daily for neutropenic fever, bacterial endocarditis and bacterial meningitis. Doses above 2 g/day may be divided every 12 hours.
Acute otitis media: single IM 1-2 g; selected severe/failed cases 1-2 g daily for 3 days.
Surgical prophylaxis: 2 g single pre-operative dose.
Gonorrhoea: 500 mg single IM dose.
Syphilis: 500 mg-1 g once daily, up to 2 g once daily for neurosyphilis, for 10-14 days.
Disseminated Lyme borreliosis: 2 g once daily for 14-21 days.
Children 15 days-12 years under 50 kg: 50-80 mg/kg once daily for intra-abdominal infection, complicated UTI, community/hospital pneumonia; 50-100 mg/kg once daily (max 4 g) for complicated skin/soft-tissue, bone/joint infection and neutropenic fever; 80-100 mg/kg once daily (max 4 g) for bacterial meningitis; 100 mg/kg once daily (max 4 g) for bacterial endocarditis.
Paediatric acute otitis media: 50 mg/kg single IM dose; selected severe/failed cases 50 mg/kg daily for 3 days.
Paediatric surgical prophylaxis: 50-80 mg/kg single pre-operative dose.
Paediatric syphilis: 75-100 mg/kg once daily (max 4 g) for 10-14 days.
Paediatric Lyme: 50-80 mg/kg once daily for 14-21 days.
Neonates 0-14 days: 20-50 mg/kg once daily for listed infections; 50 mg/kg once daily for meningitis/endocarditis; max daily dose 50 mg/kg. Premature neonates up to postmenstrual age 41 weeks are contraindicated.
Renal: generally no reduction if hepatic function is not impaired; in preterminal renal failure (CrCl <10 mL/min), do not exceed 2 g/day. No supplementary dose after dialysis.
Administration: IV infusion >=30 min preferred, slow IV injection over 5 min, or deep IM. IV doses >=50 mg/kg in infants/children <=12 years should be infused; neonatal IV doses over 60 min.$s42$::text as section_42
),
hashed as (
  select *,
    encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') section_2_sha256,
    encode(digest(section_41,'sha256'),'hex') section_41_sha256,
    encode(digest(section_42,'sha256'),'hex') section_42_sha256
  from payload
)
insert into public.dose_source_snapshots_v3(
  snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
  document_type,document_version,document_date,fetched_at,content_type,content_length,
  raw_sha256,parser_version,archive_locator
)
select
  snapshot_id,
  'EMC-PRODUCT-102127-SMPC',
  'https://www.medicines.org.uk/emc/product/102127/smpc',
  'https://www.medicines.org.uk/emc/product/102127/smpc',
  'EMC',
  'electronic Medicines Compendium (emc)',
  'United Kingdom',
  'SmPC',
  'emc-update-2026-05-01',
  date '2026-05-01',
  now(),
  'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
  octet_length(raw_text),
  snapshot_id,
  'drx-web-normalized-capture-v1',
  'https://www.medicines.org.uk/emc/product/102127/smpc'
from hashed
on conflict (snapshot_id) do nothing;

with payload as (
  select
    $raw$Source: emc product 102127
Title: Ceftriaxone 1 g powder for solution for injection/infusion
Active ingredient shown by emc: ceftriaxone sodium
ATC: J01DD04
Last updated on emc: 01 May 2026
URL: https://www.medicines.org.uk/emc/product/102127/smpc

Section 2 composition:
Each vial contains 1 g ceftriaxone as ceftriaxone sodium. The 1 g vial contains 83 mg sodium (3.6 mmol).

Section 4.1 therapeutic indications:
Ceftriaxone is indicated in adults and children, including term neonates from birth, for bacterial meningitis, community- and hospital-acquired pneumonia, acute otitis media, intra-abdominal infection, complicated UTI including pyelonephritis, bone/joint infection, complicated skin/soft-tissue infection, gonorrhoea, syphilis and bacterial endocarditis, with additional listed uses including COPD exacerbation, disseminated Lyme borreliosis, surgical prophylaxis, neutropenic fever and bacteraemia associated with listed infections.

Section 4.2 normalized posology extract:
Adults and children over 12 years (>=50 kg): 1-2 g once daily for community-acquired pneumonia, COPD exacerbation, intra-abdominal infection and complicated UTI; 2 g once daily for hospital-acquired pneumonia, complicated skin/soft-tissue infection and bone/joint infection; 2-4 g once daily for neutropenic fever, bacterial endocarditis and bacterial meningitis. Doses above 2 g/day may be divided every 12 hours.
Acute otitis media: single IM 1-2 g; selected severe/failed cases 1-2 g daily for 3 days.
Surgical prophylaxis: 2 g single pre-operative dose.
Gonorrhoea: 500 mg single IM dose.
Syphilis: 500 mg-1 g once daily, up to 2 g once daily for neurosyphilis, for 10-14 days.
Disseminated Lyme borreliosis: 2 g once daily for 14-21 days.
Children 15 days-12 years under 50 kg: 50-80 mg/kg once daily for intra-abdominal infection, complicated UTI, community/hospital pneumonia; 50-100 mg/kg once daily (max 4 g) for complicated skin/soft-tissue, bone/joint infection and neutropenic fever; 80-100 mg/kg once daily (max 4 g) for bacterial meningitis; 100 mg/kg once daily (max 4 g) for bacterial endocarditis.
Paediatric acute otitis media: 50 mg/kg single IM dose; selected severe/failed cases 50 mg/kg daily for 3 days.
Paediatric surgical prophylaxis: 50-80 mg/kg single pre-operative dose.
Paediatric syphilis: 75-100 mg/kg once daily (max 4 g) for 10-14 days.
Paediatric Lyme: 50-80 mg/kg once daily for 14-21 days.
Neonates 0-14 days: 20-50 mg/kg once daily for listed infections; 50 mg/kg once daily for meningitis/endocarditis; max daily dose 50 mg/kg. Premature neonates up to postmenstrual age 41 weeks are contraindicated.
Renal: generally no reduction if hepatic function is not impaired; in preterminal renal failure (CrCl <10 mL/min), do not exceed 2 g/day. No supplementary dose after dialysis.
Administration: IV infusion >=30 min preferred, slow IV injection over 5 min, or deep IM. IV doses >=50 mg/kg in infants/children <=12 years should be infused; neonatal IV doses over 60 min.$raw$::text as raw_text,

    $s2$Each vial contains 1 g ceftriaxone as ceftriaxone sodium. Each 1 g vial contains 83 mg sodium (3.6 mmol).$s2$::text as section_2,

    $s41$Ceftriaxone is indicated in adults and children, including term neonates from birth, for bacterial meningitis, community-acquired pneumonia, hospital-acquired pneumonia, acute otitis media, intra-abdominal infections, complicated urinary tract infections including pyelonephritis, infections of bones and joints, complicated skin and soft-tissue infections, gonorrhoea, syphilis and bacterial endocarditis. Additional listed uses include acute COPD exacerbations in adults, disseminated Lyme borreliosis, pre-operative prophylaxis of surgical-site infection, neutropenic fever suspected due to bacterial infection, and bacteraemia associated with listed infections.$s41$::text as section_41,

    $s42$Adults and children over 12 years (>=50 kg): 1-2 g once daily for community-acquired pneumonia, COPD exacerbation, intra-abdominal infection and complicated UTI; 2 g once daily for hospital-acquired pneumonia, complicated skin/soft-tissue infection and bone/joint infection; 2-4 g once daily for neutropenic fever, bacterial endocarditis and bacterial meningitis. Doses above 2 g/day may be divided every 12 hours.
Acute otitis media: single IM 1-2 g; selected severe/failed cases 1-2 g daily for 3 days.
Surgical prophylaxis: 2 g single pre-operative dose.
Gonorrhoea: 500 mg single IM dose.
Syphilis: 500 mg-1 g once daily, up to 2 g once daily for neurosyphilis, for 10-14 days.
Disseminated Lyme borreliosis: 2 g once daily for 14-21 days.
Children 15 days-12 years under 50 kg: 50-80 mg/kg once daily for intra-abdominal infection, complicated UTI, community/hospital pneumonia; 50-100 mg/kg once daily (max 4 g) for complicated skin/soft-tissue, bone/joint infection and neutropenic fever; 80-100 mg/kg once daily (max 4 g) for bacterial meningitis; 100 mg/kg once daily (max 4 g) for bacterial endocarditis.
Paediatric acute otitis media: 50 mg/kg single IM dose; selected severe/failed cases 50 mg/kg daily for 3 days.
Paediatric surgical prophylaxis: 50-80 mg/kg single pre-operative dose.
Paediatric syphilis: 75-100 mg/kg once daily (max 4 g) for 10-14 days.
Paediatric Lyme: 50-80 mg/kg once daily for 14-21 days.
Neonates 0-14 days: 20-50 mg/kg once daily for listed infections; 50 mg/kg once daily for meningitis/endocarditis; max daily dose 50 mg/kg. Premature neonates up to postmenstrual age 41 weeks are contraindicated.
Renal: generally no reduction if hepatic function is not impaired; in preterminal renal failure (CrCl <10 mL/min), do not exceed 2 g/day. No supplementary dose after dialysis.
Administration: IV infusion >=30 min preferred, slow IV injection over 5 min, or deep IM. IV doses >=50 mg/kg in infants/children <=12 years should be infused; neonatal IV doses over 60 min.$s42$::text as section_42
),
hashed as (
  select *,
    encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') section_2_sha256,
    encode(digest(section_41,'sha256'),'hex') section_41_sha256,
    encode(digest(section_42,'sha256'),'hex') section_42_sha256
  from payload
)
insert into public.dose_source_sections_v3(
  snapshot_id,section_code,section_key,heading,section_text,section_sha256,
  extracted_json,parser_version,extraction_status
)
select snapshot_id,'2','section-2','Qualitative and quantitative composition',section_2,section_2_sha256,
       jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl','https://www.medicines.org.uk/emc/product/102127/smpc','sourceLineRange','217-221'),
       'drx-web-normalized-capture-v1','extracted'
from hashed
on conflict (snapshot_id,section_code) do nothing;

with payload as (
  select
    $raw$Source: emc product 102127
Title: Ceftriaxone 1 g powder for solution for injection/infusion
Active ingredient shown by emc: ceftriaxone sodium
ATC: J01DD04
Last updated on emc: 01 May 2026
URL: https://www.medicines.org.uk/emc/product/102127/smpc

Section 2 composition:
Each vial contains 1 g ceftriaxone as ceftriaxone sodium. The 1 g vial contains 83 mg sodium (3.6 mmol).

Section 4.1 therapeutic indications:
Ceftriaxone is indicated in adults and children, including term neonates from birth, for bacterial meningitis, community- and hospital-acquired pneumonia, acute otitis media, intra-abdominal infection, complicated UTI including pyelonephritis, bone/joint infection, complicated skin/soft-tissue infection, gonorrhoea, syphilis and bacterial endocarditis, with additional listed uses including COPD exacerbation, disseminated Lyme borreliosis, surgical prophylaxis, neutropenic fever and bacteraemia associated with listed infections.

Section 4.2 normalized posology extract:
Adults and children over 12 years (>=50 kg): 1-2 g once daily for community-acquired pneumonia, COPD exacerbation, intra-abdominal infection and complicated UTI; 2 g once daily for hospital-acquired pneumonia, complicated skin/soft-tissue infection and bone/joint infection; 2-4 g once daily for neutropenic fever, bacterial endocarditis and bacterial meningitis. Doses above 2 g/day may be divided every 12 hours.
Acute otitis media: single IM 1-2 g; selected severe/failed cases 1-2 g daily for 3 days.
Surgical prophylaxis: 2 g single pre-operative dose.
Gonorrhoea: 500 mg single IM dose.
Syphilis: 500 mg-1 g once daily, up to 2 g once daily for neurosyphilis, for 10-14 days.
Disseminated Lyme borreliosis: 2 g once daily for 14-21 days.
Children 15 days-12 years under 50 kg: 50-80 mg/kg once daily for intra-abdominal infection, complicated UTI, community/hospital pneumonia; 50-100 mg/kg once daily (max 4 g) for complicated skin/soft-tissue, bone/joint infection and neutropenic fever; 80-100 mg/kg once daily (max 4 g) for bacterial meningitis; 100 mg/kg once daily (max 4 g) for bacterial endocarditis.
Paediatric acute otitis media: 50 mg/kg single IM dose; selected severe/failed cases 50 mg/kg daily for 3 days.
Paediatric surgical prophylaxis: 50-80 mg/kg single pre-operative dose.
Paediatric syphilis: 75-100 mg/kg once daily (max 4 g) for 10-14 days.
Paediatric Lyme: 50-80 mg/kg once daily for 14-21 days.
Neonates 0-14 days: 20-50 mg/kg once daily for listed infections; 50 mg/kg once daily for meningitis/endocarditis; max daily dose 50 mg/kg. Premature neonates up to postmenstrual age 41 weeks are contraindicated.
Renal: generally no reduction if hepatic function is not impaired; in preterminal renal failure (CrCl <10 mL/min), do not exceed 2 g/day. No supplementary dose after dialysis.
Administration: IV infusion >=30 min preferred, slow IV injection over 5 min, or deep IM. IV doses >=50 mg/kg in infants/children <=12 years should be infused; neonatal IV doses over 60 min.$raw$::text as raw_text,

    $s41$Ceftriaxone is indicated in adults and children, including term neonates from birth, for bacterial meningitis, community-acquired pneumonia, hospital-acquired pneumonia, acute otitis media, intra-abdominal infections, complicated urinary tract infections including pyelonephritis, infections of bones and joints, complicated skin and soft-tissue infections, gonorrhoea, syphilis and bacterial endocarditis. Additional listed uses include acute COPD exacerbations in adults, disseminated Lyme borreliosis, pre-operative prophylaxis of surgical-site infection, neutropenic fever suspected due to bacterial infection, and bacteraemia associated with listed infections.$s41$::text as section_41
),
hashed as (
  select *,
    encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_41,'sha256'),'hex') section_41_sha256
  from payload
)
insert into public.dose_source_sections_v3(
  snapshot_id,section_code,section_key,heading,section_text,section_sha256,
  extracted_json,parser_version,extraction_status
)
select snapshot_id,'4.1','section-4.1','Therapeutic indications',section_41,section_41_sha256,
       jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl','https://www.medicines.org.uk/emc/product/102127/smpc','sourceLineRange','230-267'),
       'drx-web-normalized-capture-v1','extracted'
from hashed
on conflict (snapshot_id,section_code) do nothing;

with payload as (
  select
    $raw$Source: emc product 102127
Title: Ceftriaxone 1 g powder for solution for injection/infusion
Active ingredient shown by emc: ceftriaxone sodium
ATC: J01DD04
Last updated on emc: 01 May 2026
URL: https://www.medicines.org.uk/emc/product/102127/smpc

Section 2 composition:
Each vial contains 1 g ceftriaxone as ceftriaxone sodium. The 1 g vial contains 83 mg sodium (3.6 mmol).

Section 4.1 therapeutic indications:
Ceftriaxone is indicated in adults and children, including term neonates from birth, for bacterial meningitis, community- and hospital-acquired pneumonia, acute otitis media, intra-abdominal infection, complicated UTI including pyelonephritis, bone/joint infection, complicated skin/soft-tissue infection, gonorrhoea, syphilis and bacterial endocarditis, with additional listed uses including COPD exacerbation, disseminated Lyme borreliosis, surgical prophylaxis, neutropenic fever and bacteraemia associated with listed infections.

Section 4.2 normalized posology extract:
Adults and children over 12 years (>=50 kg): 1-2 g once daily for community-acquired pneumonia, COPD exacerbation, intra-abdominal infection and complicated UTI; 2 g once daily for hospital-acquired pneumonia, complicated skin/soft-tissue infection and bone/joint infection; 2-4 g once daily for neutropenic fever, bacterial endocarditis and bacterial meningitis. Doses above 2 g/day may be divided every 12 hours.
Acute otitis media: single IM 1-2 g; selected severe/failed cases 1-2 g daily for 3 days.
Surgical prophylaxis: 2 g single pre-operative dose.
Gonorrhoea: 500 mg single IM dose.
Syphilis: 500 mg-1 g once daily, up to 2 g once daily for neurosyphilis, for 10-14 days.
Disseminated Lyme borreliosis: 2 g once daily for 14-21 days.
Children 15 days-12 years under 50 kg: 50-80 mg/kg once daily for intra-abdominal infection, complicated UTI, community/hospital pneumonia; 50-100 mg/kg once daily (max 4 g) for complicated skin/soft-tissue, bone/joint infection and neutropenic fever; 80-100 mg/kg once daily (max 4 g) for bacterial meningitis; 100 mg/kg once daily (max 4 g) for bacterial endocarditis.
Paediatric acute otitis media: 50 mg/kg single IM dose; selected severe/failed cases 50 mg/kg daily for 3 days.
Paediatric surgical prophylaxis: 50-80 mg/kg single pre-operative dose.
Paediatric syphilis: 75-100 mg/kg once daily (max 4 g) for 10-14 days.
Paediatric Lyme: 50-80 mg/kg once daily for 14-21 days.
Neonates 0-14 days: 20-50 mg/kg once daily for listed infections; 50 mg/kg once daily for meningitis/endocarditis; max daily dose 50 mg/kg. Premature neonates up to postmenstrual age 41 weeks are contraindicated.
Renal: generally no reduction if hepatic function is not impaired; in preterminal renal failure (CrCl <10 mL/min), do not exceed 2 g/day. No supplementary dose after dialysis.
Administration: IV infusion >=30 min preferred, slow IV injection over 5 min, or deep IM. IV doses >=50 mg/kg in infants/children <=12 years should be infused; neonatal IV doses over 60 min.$raw$::text as raw_text,

    $s42$Adults and children over 12 years (>=50 kg): 1-2 g once daily for community-acquired pneumonia, COPD exacerbation, intra-abdominal infection and complicated UTI; 2 g once daily for hospital-acquired pneumonia, complicated skin/soft-tissue infection and bone/joint infection; 2-4 g once daily for neutropenic fever, bacterial endocarditis and bacterial meningitis. Doses above 2 g/day may be divided every 12 hours.
Acute otitis media: single IM 1-2 g; selected severe/failed cases 1-2 g daily for 3 days.
Surgical prophylaxis: 2 g single pre-operative dose.
Gonorrhoea: 500 mg single IM dose.
Syphilis: 500 mg-1 g once daily, up to 2 g once daily for neurosyphilis, for 10-14 days.
Disseminated Lyme borreliosis: 2 g once daily for 14-21 days.
Children 15 days-12 years under 50 kg: 50-80 mg/kg once daily for intra-abdominal infection, complicated UTI, community/hospital pneumonia; 50-100 mg/kg once daily (max 4 g) for complicated skin/soft-tissue, bone/joint infection and neutropenic fever; 80-100 mg/kg once daily (max 4 g) for bacterial meningitis; 100 mg/kg once daily (max 4 g) for bacterial endocarditis.
Paediatric acute otitis media: 50 mg/kg single IM dose; selected severe/failed cases 50 mg/kg daily for 3 days.
Paediatric surgical prophylaxis: 50-80 mg/kg single pre-operative dose.
Paediatric syphilis: 75-100 mg/kg once daily (max 4 g) for 10-14 days.
Paediatric Lyme: 50-80 mg/kg once daily for 14-21 days.
Neonates 0-14 days: 20-50 mg/kg once daily for listed infections; 50 mg/kg once daily for meningitis/endocarditis; max daily dose 50 mg/kg. Premature neonates up to postmenstrual age 41 weeks are contraindicated.
Renal: generally no reduction if hepatic function is not impaired; in preterminal renal failure (CrCl <10 mL/min), do not exceed 2 g/day. No supplementary dose after dialysis.
Administration: IV infusion >=30 min preferred, slow IV injection over 5 min, or deep IM. IV doses >=50 mg/kg in infants/children <=12 years should be infused; neonatal IV doses over 60 min.$s42$::text as section_42
),
hashed as (
  select *,
    encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_42,'sha256'),'hex') section_42_sha256
  from payload
)
insert into public.dose_source_sections_v3(
  snapshot_id,section_code,section_key,heading,section_text,section_sha256,
  extracted_json,parser_version,extraction_status
)
select snapshot_id,'4.2','section-4.2','Posology and method of administration',section_42,section_42_sha256,
       jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl','https://www.medicines.org.uk/emc/product/102127/smpc','sourceLineRange','269-402'),
       'drx-web-normalized-capture-v1','extracted'
from hashed
on conflict (snapshot_id,section_code) do nothing;

-- Evidence-backed active-moiety mapping for ceftriaxone sodium -> ceftriaxone.
with snap as (
  select s.snapshot_id,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-102127-SMPC'
  order by s.created_at desc
  limit 1
)
insert into drx_dose.component_moiety_map_v1(
  source_concept_id,dose_moiety_concept_id,mapping_kind,
  source_snapshot_id,source_section_code,source_section_sha256,
  mapping_status,verified_by,verified_at,note
)
select
  src.concept_id,dst.concept_id,'ACTIVE_MOIETY',
  snap.snapshot_id,'2',snap.section_sha256,
  'VERIFIED','system:phase11m-emc-102127-composition',now(),
  'SmPC composition states 1 g ceftriaxone as ceftriaxone sodium.'
from public.substance_concepts_v1 src
join public.substance_concepts_v1 dst on dst.canonical_key='ceftriaxone'
cross join snap
where src.canonical_key='ceftriaxonesodium'
on conflict (source_concept_id) do update set
  dose_moiety_concept_id=excluded.dose_moiety_concept_id,
  mapping_kind=excluded.mapping_kind,
  source_snapshot_id=excluded.source_snapshot_id,
  source_section_code=excluded.source_section_code,
  source_section_sha256=excluded.source_section_sha256,
  mapping_status=excluded.mapping_status,
  verified_by=excluded.verified_by,
  verified_at=excluded.verified_at,
  note=excluded.note,
  updated_at=now();

-- Recompute existing rule-target moiety keys after adding the new evidence mapping.
update drx_dose.rule_targets_v1
set ingredient_concept_ids=ingredient_concept_ids;
