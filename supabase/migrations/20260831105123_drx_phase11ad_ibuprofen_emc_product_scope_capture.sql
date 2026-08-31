
-- DRx Phase 11AD: capture ibuprofen emc product-specific SmPC evidence.
-- Three presentations are deliberately kept distinct because their paediatric
-- eligibility differs. No cross-product inference is made here.

do $$
declare
  v_source_url text;
  v_source_key text;
  v_raw text;
  v_s2 text;
  v_s41 text;
  v_s42 text;
  v_s43 text;
  v_snapshot text;
  v_doc_date date;
  v_version text;
begin
  -- emc 7020: Ibuprofen 400 mg film-coated tablets (POM), scored tablet.
  v_source_url := 'https://www.medicines.org.uk/emc/product/7020/smpc';
  v_source_key := 'EMC-PRODUCT-7020-SMPC';
  v_doc_date := date '2026-07-01';
  v_version := 'emc-update-2026-07-01';
  v_s2 := 'Each film-coated tablet contains 400 mg ibuprofen.';
  v_s41 := 'Symptomatic treatment of mild to moderate pain including migraine headache; primary dysmenorrhoea; fever; and symptomatic treatment of pain and inflammation in arthritic diseases, degenerative arthritic conditions, and painful swelling/inflammation after soft-tissue injuries.';
  v_s42 := 'Adults and adolescents >=40 kg (12 years and above), mild to moderate pain and fever: 200-400 mg as a single dose or 3-4 times daily, with 6-hour intervals as required; maximum daily dose 1200 mg. Migraine: 400 mg as a single dose, if necessary repeated at intervals up to 6 hours; maximum daily dose 1200 mg. Children 20-29 kg (6-9 years): 200 mg 1-3 times daily with 6-hour intervals as required; maximum daily dose 600 mg. Children 30-90 kg (10-11 years): 200 mg 1-4 times daily with 6-hour intervals as required; maximum daily dose 800 mg. Primary dysmenorrhoea in adults/adolescents >=40 kg and >=12 years: 200-400 mg 1-3 times daily with intervals up to 6 hours as needed; maximum 1200 mg/day. Rheumatic diseases in adults: recommended 1200-1800 mg/day in divided doses; maintenance 600-1200 mg/day may be effective; acute/severe conditions may temporarily increase to maximum 2400 mg/day in 3 or 4 divided doses. Adolescents 15-17 years: 20 mg/kg/day up to 40 mg/kg/day, maximum 2400 mg/day, in 3-4 divided doses. Mild/moderate renal or hepatic impairment: use the lowest dose for the shortest duration and monitor organ function.';
  v_s43 := 'Contraindications include severe renal failure, severe hepatic failure, severe heart failure (NYHA IV), last trimester of pregnancy, significant dehydration, active bleeding or relevant prior NSAID hypersensitivity/GI bleeding history. This product is contraindicated in children below 20 kg body weight or younger than 6 years.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 7020',
    'Title: Ibuprofen 400 mg film-coated tablets (POM)',
    'Active ingredient: ibuprofen',
    'ATC: M01AE01',
    'Last updated on emc: 01 Jul 2026',
    'URL: '||v_source_url,
    'Section 2 normalized extract: '||v_s2,
    'Section 4.1 normalized extract: '||v_s41,
    'Section 4.2 normalized extract: '||v_s42,
    'Section 4.3 normalized extract: '||v_s43
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'EMC',
    'electronic Medicines Compendium (emc)','United Kingdom','SmPC',
    v_version,v_doc_date,now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-223'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','234-243'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','245-294'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','296-308'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;

  -- emc 10952: 400 mg Pharmacy presentation, >=12 years only.
  v_source_url := 'https://www.medicines.org.uk/emc/product/10952/smpc';
  v_source_key := 'EMC-PRODUCT-10952-SMPC';
  v_doc_date := date '2026-01-15';
  v_version := 'emc-update-2026-01-15';
  v_s2 := 'Each film-coated tablet contains 400 mg ibuprofen.';
  v_s41 := 'Short-term symptomatic treatment of mild to moderate pain including headache/migraine and dental pain, primary dysmenorrhoea, and fever.';
  v_s42 := 'Adults and adolescents >=40 kg (12 years and above): 200-400 mg as a single dose or 3-4 times daily with 6-hour intervals as required; maximum daily dose 1200 mg. Migraine: 400 mg as a single dose, if necessary repeated at 6-hour intervals; maximum 1200 mg/day. Primary dysmenorrhoea: 200-400 mg 1-3 times daily with 6-hour intervals as needed; maximum 1200 mg/day. This presentation should not be given to children younger than 12 years. Mild/moderate renal or hepatic impairment: use the lowest dose for the shortest duration and monitor organ function.';
  v_s43 := 'Contraindications include severe renal failure, severe hepatic failure, severe heart failure (NYHA IV), last trimester of pregnancy, significant dehydration, active bleeding, relevant NSAID hypersensitivity or GI bleeding/ulcer history. This presentation is contraindicated in children younger than 12 years.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 10952',
    'Title: Ibuprofen 400 mg film-coated tablets (Pharmacy)',
    'Active ingredient: ibuprofen',
    'ATC: M01AE01',
    'Last updated on emc: 15 Jan 2026',
    'URL: '||v_source_url,
    'Section 2 normalized extract: '||v_s2,
    'Section 4.1 normalized extract: '||v_s41,
    'Section 4.2 normalized extract: '||v_s42,
    'Section 4.3 normalized extract: '||v_s43
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'EMC',
    'electronic Medicines Compendium (emc)','United Kingdom','SmPC',
    v_version,v_doc_date,now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-223'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','234-242'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','244-275'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','277-299'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;

  -- emc 101385: 200 mg GSL, >=12 years.
  v_source_url := 'https://www.medicines.org.uk/emc/product/101385/smpc';
  v_source_key := 'EMC-PRODUCT-101385-SMPC';
  v_doc_date := date '2025-09-19';
  v_version := 'emc-update-2025-09-19';
  v_s2 := 'Each film-coated tablet contains 200 mg ibuprofen.';
  v_s41 := 'Relief of rheumatic or muscular pain, backache, neuralgia, headache including migraine, dental pain, dysmenorrhoea, feverishness and symptoms of colds and influenza.';
  v_s42 := 'Adults, elderly and children over 12 years: one to two 200 mg tablets (200-400 mg) up to three times daily as required; leave at least 4 hours between doses; maximum 6 tablets (1200 mg) in 24 hours. Adolescents 12-18 years should seek medical advice if required for more than 3 days or if symptoms worsen. Not suitable for children under 12 years.';
  v_s43 := 'Product-specific contraindications include hypersensitivity to ibuprofen/excipients and other standard NSAID contraindications as described in the SmPC.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 101385',
    'Title: Ibuprofen 200 mg Tablets (GSL)',
    'Active ingredient: ibuprofen',
    'ATC: M01AE01',
    'Last updated on emc: 19 Sep 2025',
    'URL: '||v_source_url,
    'Section 2 normalized extract: '||v_s2,
    'Section 4.1 normalized extract: '||v_s41,
    'Section 4.2 normalized extract: '||v_s42,
    'Section 4.3 normalized extract: '||v_s43
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'EMC',
    'electronic Medicines Compendium (emc)','United Kingdom','SmPC',
    v_version,v_doc_date,now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-225'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','233-237'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','239-257'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','259-280'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;
end $$;
