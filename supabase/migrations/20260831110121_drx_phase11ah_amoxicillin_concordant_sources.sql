
-- DRx Phase 11AH: capture concordant amoxicillin capsule + suspension SmPC evidence.
-- The two product sources are kept separate so regimen reuse can be supported by
-- multiple presentations without duplicating the clinical rule.

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
  -- Amoxicillin 500 mg capsules.
  v_source_url := 'https://www.medicines.org.uk/emc/product/13501/smpc';
  v_source_key := 'EMC-PRODUCT-13501-SMPC';
  v_doc_date := date '2026-04-27';
  v_version := 'emc-update-2026-04-27';
  v_s2 := 'Each hard capsule contains amoxicillin trihydrate equivalent to 500 mg amoxicillin.';
  v_s41 := 'Indications in adults and children include acute bacterial sinusitis, acute otitis media, acute streptococcal tonsillitis/pharyngitis, acute exacerbations of chronic bronchitis, community-acquired pneumonia, acute cystitis, asymptomatic bacteriuria in pregnancy, acute pyelonephritis, typhoid/paratyphoid fever, dental abscess with spreading cellulitis, prosthetic joint infections, H. pylori eradication, Lyme disease and endocarditis prophylaxis.';
  v_s42 := 'Adults/children >=40 kg: sinusitis, asymptomatic bacteriuria, pyelonephritis, dental abscess and cystitis: 250-500 mg every 8 h or 750 mg-1 g every 12 h; severe infections 750 mg-1 g every 8 h; acute cystitis may use 3 g twice daily for one day. Acute otitis media, streptococcal tonsillitis/pharyngitis and acute exacerbation chronic bronchitis: 500 mg every 8 h or 750 mg-1 g every 12 h; severe infections 750 mg-1 g every 8 h for 10 days. Community-acquired pneumonia: 500 mg-1 g every 8 h. Typhoid/paratyphoid: 500 mg-2 g every 8 h. Prosthetic joint infection: 500 mg-1 g every 8 h. Endocarditis prophylaxis: 2 g orally once 30-60 min before procedure. H. pylori: 750 mg-1 g twice daily with PPI and another antibiotic for 7 days. Lyme early: 500 mg-1 g every 8 h, max 4 g/day, usually 14 days (range 10-21); late/systemic: 500 mg-2 g every 8 h, max 6 g/day, 10-30 days. Children <40 kg: sinusitis, otitis, CAP, cystitis, pyelonephritis and dental abscess 20-90 mg/kg/day divided; tonsillitis/pharyngitis 40-90 mg/kg/day divided; typhoid/paratyphoid 100 mg/kg/day in 3 divided doses; endocarditis prophylaxis 50 mg/kg once 30-60 min before procedure; Lyme early 25-50 mg/kg/day in 3 divided doses for 10-21 days; Lyme late 100 mg/kg/day in 3 divided doses for 10-30 days. Renal: GFR >30 no adjustment; GFR 10-30 adults max 500 mg twice daily, children <40 kg 15 mg/kg twice daily max 500 mg twice daily; GFR <10 adults max 500 mg/day, children <40 kg 15 mg/kg once daily max 500 mg. Hepatic impairment: dose with caution and monitor hepatic function.';
  v_s43 := 'Contraindicated with hypersensitivity to amoxicillin/penicillins or history of severe immediate hypersensitivity to another beta-lactam agent.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 13501',
    'Title: Amoxicillin 500 mg Capsules',
    'Active ingredient: amoxicillin trihydrate equivalent to amoxicillin',
    'ATC: J01CA04',
    'Last updated on emc: 27 Apr 2026',
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
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-221'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','230-261'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','263-344'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','345-349'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;

  -- Amoxicillin 250 mg/5 mL oral suspension.
  v_source_url := 'https://www.medicines.org.uk/emc/product/10891/smpc';
  v_source_key := 'EMC-PRODUCT-10891-SMPC';
  v_doc_date := date '2026-01-12';
  v_version := 'emc-update-2026-01-12';
  v_s2 := 'Each 5 mL of reconstituted suspension contains 250 mg amoxicillin, present as amoxicillin trihydrate.';
  v_s41 := 'Indications in adults and children include acute bacterial sinusitis, acute streptococcal tonsillitis/pharyngitis, acute otitis media, acute exacerbations of chronic bronchitis, community-acquired pneumonia, acute cystitis, asymptomatic bacteriuria in pregnancy, acute pyelonephritis, typhoid/paratyphoid fever, dental abscess with spreading cellulitis, prosthetic joint infections, H. pylori eradication, Lyme disease and endocarditis prophylaxis.';
  v_s42 := 'Adults/children >=40 kg: sinusitis, asymptomatic bacteriuria, pyelonephritis, dental abscess and cystitis: 250-500 mg every 8 h or 750 mg-1 g every 12 h; severe infections 750 mg-1 g every 8 h; acute cystitis may use 3 g twice daily for one day. Acute otitis media, streptococcal tonsillitis/pharyngitis and acute exacerbation chronic bronchitis: 500 mg every 8 h or 750 mg-1 g every 12 h; severe infections 750 mg-1 g every 8 h for 10 days. Community-acquired pneumonia: 500 mg-1 g every 8 h. Typhoid/paratyphoid: 500 mg-2 g every 8 h. Prosthetic joint infection: 500 mg-1 g every 8 h. Endocarditis prophylaxis: 2 g orally once 30-60 min before procedure. H. pylori: 750 mg-1 g twice daily with PPI and another antibiotic for 7 days. Lyme early: 500 mg-1 g every 8 h, max 4 g/day, 10-21 days; Lyme late/systemic: 500 mg-2 g every 8 h, max 6 g/day, 10-30 days. Children <40 kg: sinusitis, otitis, CAP, cystitis, pyelonephritis and dental abscess 20-90 mg/kg/day divided; tonsillitis/pharyngitis 40-90 mg/kg/day divided; typhoid/paratyphoid 100 mg/kg/day in three divided doses; endocarditis prophylaxis 50 mg/kg once 30-60 min before procedure; Lyme early 25-50 mg/kg/day in three divided doses for 10-21 days; Lyme late 100 mg/kg/day in three divided doses for 10-30 days. Paediatric suspension is recommended under six months. Renal: GFR >30 no adjustment; GFR 10-30 adults max 500 mg twice daily, children <40 kg 15 mg/kg twice daily max 500 mg twice daily; GFR <10 adults max 500 mg/day, children <40 kg 15 mg/kg once daily max 500 mg. Hepatic impairment: dose with caution and monitor hepatic function.';
  v_s43 := 'Contraindicated with hypersensitivity to amoxicillin/penicillins or history of severe immediate hypersensitivity to another beta-lactam agent.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 10891',
    'Title: Amoxicillin Sugar Free 250 mg/5 mL Powder for Oral Suspension',
    'Active ingredient: amoxicillin trihydrate equivalent to amoxicillin',
    'ATC: J01CA04',
    'Last updated on emc: 12 Jan 2026',
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
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','216-225'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','233-265'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','267-346'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','348-352'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;
end $$;
