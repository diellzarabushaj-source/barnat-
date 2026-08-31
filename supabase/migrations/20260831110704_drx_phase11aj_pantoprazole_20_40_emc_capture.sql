
-- DRx Phase 11AJ: capture concordant oral pantoprazole 20 mg / 40 mg emc SmPC evidence.
-- Product strengths remain distinct; active-moiety reuse is handled in the next migration.

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
  -- Pantoprazole 20 mg gastro-resistant tablets.
  v_source_url := 'https://www.medicines.org.uk/emc/product/14643/smpc';
  v_source_key := 'EMC-PRODUCT-14643-SMPC';
  v_doc_date := date '2026-02-26';
  v_version := 'emc-update-2026-02-26';
  v_s2 := 'Each gastro-resistant tablet contains 20 mg pantoprazole (as sodium sesquihydrate).';
  v_s41 := 'Adults and adolescents 12 years and above: symptomatic gastro-oesophageal reflux disease; long-term management and prevention of relapse in reflux oesophagitis. Adults: prevention of gastroduodenal ulcers induced by non-selective NSAIDs in at-risk patients requiring continuous NSAID treatment.';
  v_s42 := 'Adults and adolescents >=12 years: symptomatic gastro-oesophageal reflux disease: 20 mg once daily; symptom relief usually within 2-4 weeks and may require a further 4 weeks. After symptom relief, recurrent symptoms may be controlled on demand with 20 mg once daily when required; continuous treatment may be used if on-demand control is inadequate. Long-term management/prevention of relapse in reflux oesophagitis: 20 mg once daily; if relapse occurs, increase to 40 mg once daily, then reduce again to 20 mg after healing. Adults: prevention of NSAID-induced gastroduodenal ulcers in at-risk patients requiring continuous NSAID treatment: 20 mg once daily. Severe hepatic impairment: do not exceed 20 mg/day. Renal impairment: no dose adjustment necessary. Elderly: no dose adjustment necessary. Paediatric: not recommended below 12 years. Oral use; swallow gastro-resistant tablets whole, 1 hour before a meal.';
  v_s43 := 'Contraindicated with hypersensitivity to pantoprazole, substituted benzimidazoles or any listed excipient.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 14643',
    'Title: Pantoprazole 20 mg gastro-resistant tablets',
    'Active ingredient: pantoprazole sodium sesquihydrate',
    'ATC: A02BC02',
    'Last updated on emc: 26 Feb 2026',
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
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-230'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','239-248'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','250-289'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','290-292'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;

  -- Pantoprazole 40 mg gastro-resistant tablets.
  v_source_url := 'https://www.medicines.org.uk/emc/product/14644/smpc';
  v_source_key := 'EMC-PRODUCT-14644-SMPC';
  v_doc_date := date '2026-02-26';
  v_version := 'emc-update-2026-02-26';
  v_s2 := 'Each gastro-resistant tablet contains 40 mg pantoprazole (as sodium sesquihydrate).';
  v_s41 := 'Adults and adolescents 12 years and above: reflux oesophagitis. Adults: eradication of H. pylori in combination with appropriate antibiotics in H. pylori-associated ulcers; gastric ulcer; duodenal ulcer; Zollinger-Ellison syndrome and other pathological hypersecretory conditions.';
  v_s42 := 'Adults and adolescents >=12 years: reflux oesophagitis: 40 mg once daily; in individual cases may increase to 80 mg/day, usually for 4 weeks and, if needed, a further 4 weeks. Adults: H. pylori eradication combination therapy: pantoprazole 40 mg twice daily with two appropriate antibiotics; generally 7 days, may extend to 14 days. Gastric ulcer: 40 mg once daily, may increase to 80 mg/day; usually 4 weeks, with a further 4 weeks if needed. Duodenal ulcer: 40 mg once daily, may increase to 80 mg/day; usually 2 weeks, with a further 2 weeks if needed. Zollinger-Ellison syndrome/other pathological hypersecretory conditions: start 80 mg/day, titrate according to gastric acid secretion; doses above 80 mg/day should be divided twice daily; temporary doses above 160 mg/day are possible when required for adequate acid control. Severe hepatic impairment: do not exceed 20 mg/day. Do not use H. pylori combination treatment in moderate-severe hepatic dysfunction. Renal impairment: no general dose adjustment; do not use H. pylori combination treatment in renal impairment. Elderly: no dose adjustment. Paediatric: not recommended below 12 years. Oral use; swallow whole 1 hour before a meal.';
  v_s43 := 'Contraindicated with hypersensitivity to pantoprazole, substituted benzimidazoles or any listed excipient.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 14644',
    'Title: Pantoprazole 40 mg gastro-resistant tablets',
    'Active ingredient: pantoprazole sodium sesquihydrate',
    'ATC: A02BC02',
    'Last updated on emc: 26 Feb 2026',
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
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-230'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','239-251'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','252-315'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.3','section-4.3','Contraindications',v_s43,encode(digest(v_s43,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','317-319'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;
end $$;
