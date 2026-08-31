
-- DRx Phase 11Q: capture rivaroxaban 10/15/20 mg emc SmPC evidence.
-- Normalized source-backed captures; no rule publication or automatic clinical binding.

do $$
declare
  v_source_url text;
  v_source_key text;
  v_strength text;
  v_raw text;
  v_s2 text;
  v_s41 text;
  v_s42 text;
  v_snapshot text;
begin
  -- 20 mg
  v_source_url := 'https://www.medicines.org.uk/emc/product/101916/smpc';
  v_source_key := 'EMC-PRODUCT-101916-SMPC';
  v_strength := '20 mg';
  v_s2 := 'Each film-coated tablet contains 20 mg rivaroxaban.';
  v_s41 := 'Adults: prevention of stroke and systemic embolism in non-valvular atrial fibrillation with risk factors; treatment of DVT and PE and prevention of recurrent DVT/PE. Paediatric population: treatment of VTE and prevention of recurrence in patients under 18 years weighing more than 50 kg after at least 5 days of initial parenteral anticoagulation.';
  v_s42 := 'Adults: non-valvular atrial fibrillation 20 mg once daily. Acute DVT/PE: 15 mg twice daily for days 1-21, then 20 mg once daily. Extended recurrence prevention after at least 6 months: 10 mg once daily, or 20 mg once daily when recurrence risk is considered high. Paediatric VTE after at least 5 days parenteral anticoagulation: >50 kg, 20 mg once daily; 30-50 kg, 15 mg once daily. Adult renal impairment: CrCl 15-29 mL/min use with caution; CrCl <15 mL/min not recommended. For NVAF with CrCl 15-49 mL/min, 15 mg once daily. For DVT/PE after the initial 3 weeks, reduction from 20 mg to 15 mg once daily may be considered when bleeding risk outweighs recurrence risk. Paediatric GFR <50 mL/min/1.73m2 is not recommended. Hepatic disease associated with coagulopathy and clinically relevant bleeding risk is contraindicated. 15 mg and 20 mg tablets are taken with food.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 101916',
    'Title: Rivaroxaban 20 mg film-coated tablets',
    'Active ingredient: rivaroxaban',
    'Last updated on emc: 16 Feb 2026',
    'URL: '||v_source_url,
    'Section 2 normalized extract: '||v_s2,
    'Section 4.1 normalized extract: '||v_s41,
    'Section 4.2 normalized extract: '||v_s42
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'EMC',
    'electronic Medicines Compendium (emc)','United Kingdom','SmPC',
    'emc-update-2026-02-16',date '2026-02-16',now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-224'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','234-242'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','244-382'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;

  -- 15 mg
  v_source_url := 'https://www.medicines.org.uk/emc/product/101915/smpc';
  v_source_key := 'EMC-PRODUCT-101915-SMPC';
  v_s2 := 'Each film-coated tablet contains 15 mg rivaroxaban.';
  v_s41 := 'Adults: prevention of stroke and systemic embolism in non-valvular atrial fibrillation with risk factors; treatment of DVT and PE and prevention of recurrent DVT/PE. Paediatric population: treatment of VTE and prevention of recurrence in patients under 18 years weighing 30 kg to 50 kg after at least 5 days of initial parenteral anticoagulation.';
  v_s42 := 'Adults: NVAF standard dose is 20 mg once daily; 15 mg is used as the reduced NVAF dose in moderate/severe renal impairment according to the renal recommendations. Acute DVT/PE: 15 mg twice daily for the first 3 weeks followed by 20 mg once daily. Extended recurrence prevention after at least 6 months uses 10 mg once daily or 20 mg once daily according to recurrence risk. Paediatric VTE after at least 5 days parenteral anticoagulation: 30-50 kg, 15 mg once daily; >=50 kg, 20 mg once daily; below 30 kg refer to oral suspension. Adult CrCl <15 mL/min is not recommended; CrCl 15-29 mL/min use with caution. Tablets are oral and 15 mg doses are taken with food.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 101915',
    'Title: Rivaroxaban 15 mg film-coated tablets',
    'Active ingredient: rivaroxaban',
    'Last updated on emc: 16 Feb 2026',
    'URL: '||v_source_url,
    'Section 2 normalized extract: '||v_s2,
    'Section 4.1 normalized extract: '||v_s41,
    'Section 4.2 normalized extract: '||v_s42
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'EMC',
    'electronic Medicines Compendium (emc)','United Kingdom','SmPC',
    'emc-update-2026-02-16',date '2026-02-16',now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-224'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','234-242'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','244-330'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;

  -- 10 mg
  v_source_url := 'https://www.medicines.org.uk/emc/product/101914/smpc';
  v_source_key := 'EMC-PRODUCT-101914-SMPC';
  v_s2 := 'Each film-coated tablet contains 10 mg rivaroxaban.';
  v_s41 := 'Adults: prevention of venous thromboembolism after elective hip or knee replacement surgery; treatment of DVT and PE and prevention of recurrent DVT/PE.';
  v_s42 := 'Elective hip/knee replacement VTE prophylaxis: 10 mg orally once daily, first dose 6-10 hours after surgery once haemostasis is established; duration 5 weeks after major hip surgery and 2 weeks after major knee surgery. Acute DVT/PE: 15 mg twice daily for days 1-21, then 20 mg once daily. Extended prevention after at least 6 months treatment: 10 mg once daily, or 20 mg once daily when recurrence risk is considered high. Severe renal impairment CrCl 15-29 mL/min requires caution; CrCl <15 mL/min is not recommended. For 10 mg regimens no dose adjustment is needed for mild or moderate renal impairment under the listed indications. Oral use.';
  v_raw := concat_ws(E'\n\n',
    'Source: emc product 101914',
    'Title: Rivaroxaban 10 mg film-coated tablets',
    'Active ingredient: rivaroxaban',
    'Last updated on emc: 16 Feb 2026',
    'URL: '||v_source_url,
    'Section 2 normalized extract: '||v_s2,
    'Section 4.1 normalized extract: '||v_s41,
    'Section 4.2 normalized extract: '||v_s42
  );
  v_snapshot := encode(digest(v_raw,'sha256'),'hex');

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,parser_version,archive_locator
  ) values (
    v_snapshot,v_source_key,v_source_url,v_source_url,'EMC',
    'electronic Medicines Compendium (emc)','United Kingdom','SmPC',
    'emc-update-2026-02-16',date '2026-02-16',now(),
    'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
    octet_length(v_raw),v_snapshot,'drx-web-normalized-capture-v1',v_source_url
  ) on conflict (snapshot_id) do nothing;

  insert into public.dose_source_sections_v3(
    snapshot_id,section_code,section_key,heading,section_text,section_sha256,
    extracted_json,parser_version,extraction_status
  ) values
    (v_snapshot,'2','section-2','Qualitative and quantitative composition',v_s2,encode(digest(v_s2,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','217-224'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.1','section-4.1','Therapeutic indications',v_s41,encode(digest(v_s41,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','234-237'),
     'drx-web-normalized-capture-v1','extracted'),
    (v_snapshot,'4.2','section-4.2','Posology and method of administration',v_s42,encode(digest(v_s42,'sha256'),'hex'),
     jsonb_build_object('captureMethod','normalized_public_web_capture','sourceUrl',v_source_url,'sourceLines','239-292'),
     'drx-web-normalized-capture-v1','extracted')
  on conflict (snapshot_id,section_code) do nothing;
end $$;
