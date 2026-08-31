
-- DRx Phase 11P: capture high-priority desloratadine 5 mg emc SmPC evidence.

with payload as (
  select
    $raw$Source: emc product 14722
Title: Desloratadine 5 mg film-coated tablets
Active ingredient: desloratadine
ATC: R06AX27
Last updated on emc: 18 Apr 2023
URL: https://www.medicines.org.uk/emc/product/14722/smpc

Section 2:
Each film-coated tablet contains 5 mg desloratadine.

Section 4.1:
Desloratadine is indicated in adults and adolescents aged 12 years or older for relief of symptoms associated with allergic rhinitis and urticaria.

Section 4.2 normalized extract:
Adults and adolescents aged 12 years and over: one 5 mg tablet once daily.
Intermittent allergic rhinitis may be stopped after symptoms resolve and restarted on recurrence; persistent allergic rhinitis may be treated continuously during allergen exposure periods.
Safety and efficacy of desloratadine film-coated tablets below 12 years have not been established.
Oral use; dose may be taken with or without food.
Severe renal insufficiency: use with caution (section 4.4).$raw$::text raw_text,
    $s2$Each film-coated tablet contains 5 mg desloratadine.$s2$::text section_2,
    $s41$Desloratadine is indicated in adults and adolescents aged 12 years or older for relief of symptoms associated with allergic rhinitis and urticaria.$s41$::text section_41,
    $s42$Adults and adolescents aged 12 years and over: one 5 mg tablet once daily.
Intermittent allergic rhinitis may be stopped after symptoms resolve and restarted on recurrence; persistent allergic rhinitis may be treated continuously during allergen exposure periods.
Safety and efficacy of desloratadine film-coated tablets below 12 years have not been established.
Oral use; dose may be taken with or without food.
Severe renal insufficiency: use with caution.$s42$::text section_42
),
h as (
  select *,
    encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') s2hash,
    encode(digest(section_41,'sha256'),'hex') s41hash,
    encode(digest(section_42,'sha256'),'hex') s42hash
  from payload
)
insert into public.dose_source_snapshots_v3(
  snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
  document_type,document_version,document_date,fetched_at,content_type,content_length,
  raw_sha256,parser_version,archive_locator
)
select
  snapshot_id,'EMC-PRODUCT-14722-SMPC',
  'https://www.medicines.org.uk/emc/product/14722/smpc',
  'https://www.medicines.org.uk/emc/product/14722/smpc',
  'EMC','electronic Medicines Compendium (emc)','United Kingdom',
  'SmPC','emc-update-2023-04-18',date '2023-04-18',now(),
  'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
  octet_length(raw_text),snapshot_id,'drx-web-normalized-capture-v1',
  'https://www.medicines.org.uk/emc/product/14722/smpc'
from h on conflict (snapshot_id) do nothing;

with p as (
  select
    $raw$Source: emc product 14722
Title: Desloratadine 5 mg film-coated tablets
Active ingredient: desloratadine
ATC: R06AX27
Last updated on emc: 18 Apr 2023
URL: https://www.medicines.org.uk/emc/product/14722/smpc

Section 2:
Each film-coated tablet contains 5 mg desloratadine.

Section 4.1:
Desloratadine is indicated in adults and adolescents aged 12 years or older for relief of symptoms associated with allergic rhinitis and urticaria.

Section 4.2 normalized extract:
Adults and adolescents aged 12 years and over: one 5 mg tablet once daily.
Intermittent allergic rhinitis may be stopped after symptoms resolve and restarted on recurrence; persistent allergic rhinitis may be treated continuously during allergen exposure periods.
Safety and efficacy of desloratadine film-coated tablets below 12 years have not been established.
Oral use; dose may be taken with or without food.
Severe renal insufficiency: use with caution (section 4.4).$raw$::text raw_text,
    $s2$Each film-coated tablet contains 5 mg desloratadine.$s2$::text section_2,
    $s41$Desloratadine is indicated in adults and adolescents aged 12 years or older for relief of symptoms associated with allergic rhinitis and urticaria.$s41$::text section_41,
    $s42$Adults and adolescents aged 12 years and over: one 5 mg tablet once daily.
Intermittent allergic rhinitis may be stopped after symptoms resolve and restarted on recurrence; persistent allergic rhinitis may be treated continuously during allergen exposure periods.
Safety and efficacy of desloratadine film-coated tablets below 12 years have not been established.
Oral use; dose may be taken with or without food.
Severe renal insufficiency: use with caution.$s42$::text section_42
  ),
h as (
  select *,
    encode(digest(raw_text,'sha256'),'hex') snapshot_id,
    encode(digest(section_2,'sha256'),'hex') s2hash,
    encode(digest(section_41,'sha256'),'hex') s41hash,
    encode(digest(section_42,'sha256'),'hex') s42hash
  from p
)
insert into public.dose_source_sections_v3(
  snapshot_id,section_code,section_key,heading,section_text,section_sha256,
  extracted_json,parser_version,extraction_status
)
select snapshot_id,x.section_code,'section-'||x.section_code,x.heading,x.section_text,x.section_hash,
       jsonb_build_object(
         'captureMethod','normalized_public_web_capture',
         'sourceUrl','https://www.medicines.org.uk/emc/product/14722/smpc'
       ),
       'drx-web-normalized-capture-v1','extracted'
from h
cross join lateral (values
  ('2','Qualitative and quantitative composition',h.section_2,h.s2hash),
  ('4.1','Therapeutic indications',h.section_41,h.s41hash),
  ('4.2','Posology and method of administration',h.section_42,h.s42hash)
) x(section_code,heading,section_text,section_hash)
on conflict (snapshot_id,section_code) do nothing;
