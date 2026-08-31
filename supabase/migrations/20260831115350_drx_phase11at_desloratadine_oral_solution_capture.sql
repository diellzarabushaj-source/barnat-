
-- DRx Phase 11AT: capture desloratadine 0.5 mg/mL oral-solution SmPC evidence.
-- Source: NeoClarityn Oral Solution, emc product 6510.

do $$
declare
  v_source_url text := 'https://www.medicines.org.uk/emc/product/6510/smpc';
  v_source_key text := 'EMC-PRODUCT-6510-SMPC';
  v_s2 text;
  v_s41 text;
  v_s42 text;
  v_s43 text;
  v_raw text;
  v_snapshot text;
begin
  v_s2 := 'Each mL of oral solution contains 0.5 mg desloratadine.';
  v_s41 := 'Adults, adolescents and children over 1 year: relief of symptoms associated with allergic rhinitis and urticaria.';
  v_s42 := 'Adults and adolescents 12 years and over: 10 mL (5 mg) oral solution once daily. Children 1 through 5 years: 2.5 mL (1.25 mg) once daily. Children 6 through 11 years: 5 mL (2.5 mg) once daily. Safety and efficacy below 1 year have not been established. Oral use; dose can be taken with or without food. Intermittent allergic rhinitis may be stopped after symptoms resolve and restarted if they recur; persistent allergic rhinitis may be treated continuously during allergen exposure.';
  v_s43 := 'Contraindicated in hypersensitivity to desloratadine, any excipient, or loratadine.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 6510',
    'Title: NeoClarityn Oral Solution',
    'Active ingredient: desloratadine',
    'Concentration: 0.5 mg/mL',
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
    'emc-current-capture-2026-08-31',null,now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;
end $$;
