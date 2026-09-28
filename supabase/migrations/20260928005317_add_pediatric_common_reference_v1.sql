-- Source-exact pediatric common-drug reference imported from the user-supplied 3-table image set.
-- Applied to Supabase production on 2026-09-28.
-- This is an additive reference dataset. It does NOT mark the table values as independently clinically verified.

create table if not exists public.pediatric_common_reference_snapshots_v1 (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null unique,
  version text not null,
  source_kind text not null,
  source_date date not null,
  source_title text not null,
  git_commit_sha text,
  payload jsonb not null,
  payload_sha256 text generated always as (encode(extensions.digest((payload)::text, 'sha256'::text), 'hex'::text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pediatric_common_reference_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint pediatric_common_reference_dataset_key_check check (btrim(dataset_key) <> ''),
  constraint pediatric_common_reference_version_check check (btrim(version) <> '')
);

create table if not exists public.pediatric_common_reference_rows_v1 (
  snapshot_id uuid not null references public.pediatric_common_reference_snapshots_v1(id) on delete cascade,
  section_order integer not null,
  section_roman text not null,
  section_title text not null,
  drug_order integer not null,
  drug_no integer not null,
  drug_name text not null,
  dose_lines jsonb not null,
  formulation_lines jsonb not null,
  calculator jsonb not null,
  source_row jsonb not null,
  source_row_sha256 text generated always as (encode(extensions.digest((source_row)::text, 'sha256'::text), 'hex'::text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (snapshot_id, section_order, drug_order),
  constraint pediatric_common_reference_section_order_check check (section_order between 1 and 10),
  constraint pediatric_common_reference_drug_order_check check (drug_order >= 1),
  constraint pediatric_common_reference_drug_no_check check (drug_no >= 1),
  constraint pediatric_common_reference_dose_array_check check (jsonb_typeof(dose_lines) = 'array'),
  constraint pediatric_common_reference_formulation_array_check check (jsonb_typeof(formulation_lines) = 'array'),
  constraint pediatric_common_reference_calculator_array_check check (jsonb_typeof(calculator) = 'array'),
  constraint pediatric_common_reference_source_row_object_check check (jsonb_typeof(source_row) = 'object')
);

create index if not exists pediatric_common_reference_rows_name_idx
  on public.pediatric_common_reference_rows_v1 (lower(drug_name));
create index if not exists pediatric_common_reference_rows_section_idx
  on public.pediatric_common_reference_rows_v1 (snapshot_id, section_order, drug_no);

alter table public.pediatric_common_reference_snapshots_v1 enable row level security;
alter table public.pediatric_common_reference_rows_v1 enable row level security;
revoke all on table public.pediatric_common_reference_snapshots_v1 from anon, authenticated;
revoke all on table public.pediatric_common_reference_rows_v1 from anon, authenticated;

insert into public.pediatric_common_reference_snapshots_v1 (
  dataset_key, version, source_kind, source_date, source_title, git_commit_sha, payload, updated_at
)
values (
  'pediatric_common_drugs_20260928',
  '2026-09-28.v1',
  'user_supplied_table_images',
  date '2026-09-28',
  'Pediatric Doses of Common Drugs',
  '7d2d2674b3826ff10f3445f19aac9dd0441b5c97',
  $pediatric_json${"metadata":{"title":"Pediatric Doses of Common Drugs","source":"User-supplied table images, 2026-09-28","displayFidelity":"Source wording preserved","calculator":"Arithmetic only; not independently clinically validated"},"sections":[{"roman":"I","title":"Antibiotics","drugs":[{"no":1,"name":"Amoxicillin","dose":["15mg/kg/dose q8h","Pneumonia – 80-90mg/kg/day"],"formulations":["Syp – 125/5, 250/5","Cap – 250mg, 500mg","Dps – 100/1"],"calc":[{"label":"15mg/kg/dose q8h","mode":"weight","min":15,"max":15,"unit":"mg","period":"dose","frequency":"q8h"},{"label":"Pneumonia – 80-90mg/kg/day","mode":"weight","min":80,"max":90,"unit":"mg","period":"day","frequency":""}]},{"no":2,"name":"Amoxicillin + Clavulanic","dose":["Same as Amoxicillin"],"formulations":["Syp – 228.5/5, 457/5","Tab – 375mg, 625mg","Dps – 91.4/1","Vial – 1.2g (1000 Amox + 200 Clav)"],"calc":[{"label":"15mg/kg/dose q8h","displayLabel":"Same as Amoxicillin · 15mg/kg/dose q8h","mode":"weight","min":15,"max":15,"unit":"mg","period":"dose","frequency":"q8h"},{"label":"Pneumonia – 80-90mg/kg/day","displayLabel":"Same as Amoxicillin · Pneumonia – 80-90mg/kg/day","mode":"weight","min":80,"max":90,"unit":"mg","period":"day","frequency":""}]},{"no":3,"name":"Ampicillin","dose":["50mg/kg/dose q6h"],"formulations":["500mg vial","Cap – 250mg, 500mg"],"calc":[{"label":"50mg/kg/dose q6h","mode":"weight","min":50,"max":50,"unit":"mg","period":"dose","frequency":"q6h"}]},{"no":4,"name":"Cloxacillin","dose":["25mg/kg/dose q6h"],"formulations":["250mg, 500mg vial","Syp – 125 Ampicillin+125 Cloxacillin /5","Cap – Ampi 250 + Clox 250 mg"],"calc":[{"label":"25mg/kg/dose q6h","mode":"weight","min":25,"max":25,"unit":"mg","period":"dose","frequency":"q6h"}]},{"no":5,"name":"Penicillin G","dose":["50,000 U /kg/dose q6h"],"formulations":["5 lakhs vial"],"calc":[{"label":"50,000 U /kg/dose q6h","mode":"weight","min":50000,"max":50000,"unit":"U","period":"dose","frequency":"q6h"}]},{"no":6,"name":"Piperacillin + Tazobactam","dose":["100mg/kg/dose q8h"],"formulations":["4.5g vial"],"calc":[{"label":"100mg/kg/dose q8h","mode":"weight","min":100,"max":100,"unit":"mg","period":"dose","frequency":"q8h"}]},{"no":7,"name":"Meropenem","dose":["20-40mg/kg/dose q8h"],"formulations":["1g vial"],"calc":[{"label":"20-40mg/kg/dose q8h","mode":"weight","min":20,"max":40,"unit":"mg","period":"dose","frequency":"q8h"}]},{"no":8,"name":"Cotrimoxazole (TMP + SMZ)","dose":["6mg/kg/day of TMP q12h","PCP – 20mg/kg/day q6-8hr","Prophylaxis – 5mg/kg/day as BD 3 days /week"],"formulations":["Tab – 80mg (TMP), 160mg","Syp – 40/5"],"calc":[{"label":"6mg/kg/day of TMP q12h","mode":"weight","min":6,"max":6,"unit":"mg TMP","period":"day","frequency":"q12h","split":2},{"label":"PCP – 20mg/kg/day q6-8hr","mode":"weight","min":20,"max":20,"unit":"mg","period":"day","frequency":"q6-8hr"},{"label":"Prophylaxis – 5mg/kg/day as BD 3 days /week","mode":"weight","min":5,"max":5,"unit":"mg","period":"day","frequency":"BD 3 days /week","split":2}]},{"no":9,"name":"Azithromycin","dose":["10mg/kg/day OD on d1","5mg/kg/day OD next 4 days"],"formulations":["Tab – 250mg, 500mg","Syp – 100/5, 200/5"],"calc":[{"label":"10mg/kg/day OD on d1","mode":"weight","min":10,"max":10,"unit":"mg","period":"day","frequency":"OD on d1","split":1},{"label":"5mg/kg/day OD next 4 days","mode":"weight","min":5,"max":5,"unit":"mg","period":"day","frequency":"OD next 4 days","split":1}]},{"no":10,"name":"Clarithromycin","dose":["7.5mg/kg/dose BD"],"formulations":["Tab – 250mg, 500mg","Syp – 125/5"],"calc":[{"label":"7.5mg/kg/dose BD","mode":"weight","min":7.5,"max":7.5,"unit":"mg","period":"dose","frequency":"BD"}]},{"no":11,"name":"Levofloxacin","dose":["10mg/kg/dose OD"],"formulations":["Tab – 250mg, 500mg"],"calc":[{"label":"10mg/kg/dose OD","mode":"weight","min":10,"max":10,"unit":"mg","period":"dose","frequency":"OD"}]},{"no":12,"name":"Amikacin","dose":["15mg/kg/day OD"],"formulations":["2ml vial, 125mg/1ml"],"calc":[{"label":"15mg/kg/day OD","mode":"weight","min":15,"max":15,"unit":"mg","period":"day","frequency":"OD","split":1}]},{"no":13,"name":"Gentamicin","dose":["5mg/kg/day OD"],"formulations":["2ml vial, 40mg/1"],"calc":[{"label":"5mg/kg/day OD","mode":"weight","min":5,"max":5,"unit":"mg","period":"day","frequency":"OD","split":1}]},{"no":14,"name":"Cefixime","dose":["5mg/kg/dose BD"],"formulations":["Tab – 100mg, 200mg","Syp – 50/5, 100/5"],"calc":[{"label":"5mg/kg/dose BD","mode":"weight","min":5,"max":5,"unit":"mg","period":"dose","frequency":"BD"}]},{"no":15,"name":"Cefpodoxime","dose":["5mg/kg/dose BD"],"formulations":["Tab – 100mg, 200mg","Syp – 50/5, 100/5"],"calc":[{"label":"5mg/kg/dose BD","mode":"weight","min":5,"max":5,"unit":"mg","period":"dose","frequency":"BD"}]},{"no":16,"name":"Cefoperazone","dose":["50mg/kg/dose BD,","Can give upto 150mg/kg/day q8h"],"formulations":["1.5g vial (1000 Cefo+500 Sulbactam)"],"calc":[{"label":"50mg/kg/dose BD,","mode":"weight","min":50,"max":50,"unit":"mg","period":"dose","frequency":"BD"},{"label":"Can give upto 150mg/kg/day q8h","mode":"weight","min":150,"max":150,"unit":"mg","period":"day","frequency":"q8h","split":3}]},{"no":17,"name":"Cefotaxime","dose":["50mg/kg/dose q8h","Meningitis – q6h"],"formulations":["1g vial"],"calc":[{"label":"50mg/kg/dose q8h","mode":"weight","min":50,"max":50,"unit":"mg","period":"dose","frequency":"q8h"},{"label":"Meningitis – q6h","displayLabel":"Meningitis – 50mg/kg/dose q6h","mode":"weight","min":50,"max":50,"unit":"mg","period":"dose","frequency":"q6h"}]},{"no":18,"name":"Ceftazidime","dose":["50mg/kg/dose q8h"],"formulations":["1g vial"],"calc":[{"label":"50mg/kg/dose q8h","mode":"weight","min":50,"max":50,"unit":"mg","period":"dose","frequency":"q8h"}]},{"no":19,"name":"Ceftriaxone","dose":["50mg/kg/dose BD"],"formulations":["1g vial"],"calc":[{"label":"50mg/kg/dose BD","mode":"weight","min":50,"max":50,"unit":"mg","period":"dose","frequency":"BD"}]},{"no":20,"name":"Cefuroxime","dose":["i.m, i.v -50mg/kg/dose q8h","oral – 15mg/kg/dose BD"],"formulations":["1.5g vial","Tab – 250mg, 500mg","Syp – 125/5"],"calc":[{"label":"i.m, i.v -50mg/kg/dose q8h","mode":"weight","min":50,"max":50,"unit":"mg","period":"dose","frequency":"q8h"},{"label":"oral – 15mg/kg/dose BD","mode":"weight","min":15,"max":15,"unit":"mg","period":"dose","frequency":"BD"}]},{"no":21,"name":"Cephalexin","dose":["20mg/kg/dose q6h"],"formulations":["Cap – 250mg, 500mg","Syp – 125/5, 250/5"],"calc":[{"label":"20mg/kg/dose q6h","mode":"weight","min":20,"max":20,"unit":"mg","period":"dose","frequency":"q6h"}]},{"no":22,"name":"Colistin","dose":["2.5mg/kg/day","75,000U/kg/day Q8h"],"formulations":["1 million U vial"],"calc":[{"label":"2.5mg/kg/day","mode":"weight","min":2.5,"max":2.5,"unit":"mg","period":"day","frequency":""},{"label":"75,000U/kg/day Q8h","mode":"weight","min":75000,"max":75000,"unit":"U","period":"day","frequency":"Q8h","split":3}]},{"no":23,"name":"Doxycycline","dose":["2.2mg/kg/dose BD"],"formulations":["Tab – 100mg, 200mg"],"calc":[{"label":"2.2mg/kg/dose BD","mode":"weight","min":2.2,"max":2.2,"unit":"mg","period":"dose","frequency":"BD"}]},{"no":24,"name":"Linezolid","dose":["10mg/kg/dose q8h infusion 2-3 hrs"],"formulations":["Syp – 100/5","Tab – 600mg"],"calc":[{"label":"10mg/kg/dose q8h infusion 2-3 hrs","mode":"weight","min":10,"max":10,"unit":"mg","period":"dose","frequency":"q8h infusion 2-3 hrs"}]},{"no":25,"name":"Vancomycin","dose":["15-20mg/kg/dose q6h"],"formulations":["500mg vial"],"calc":[{"label":"15-20mg/kg/dose q6h","mode":"weight","min":15,"max":20,"unit":"mg","period":"dose","frequency":"q6h"}]}]},{"roman":"II","title":"Anti- Helminthics","drugs":[{"no":1,"name":"Albendazole","dose":["1-2yrs – 200mg","≥ 2yrs – 400mg"],"formulations":["Tab 400mg","Syp 400/10"],"calc":[{"label":"Sipas moshës","mode":"ageBands","bands":[{"minMonths":12,"maxMonths":24,"min":200,"max":200,"unit":"mg","source":"1-2yrs – 200mg","maxInclusive":false},{"minMonths":24,"min":400,"max":400,"unit":"mg","source":"≥ 2yrs – 400mg","minInclusive":true}]}]},{"no":2,"name":"DEC","dose":["6mg/kg/day q8h"],"formulations":["Tab – 50mg, 100mg"],"calc":[{"label":"6mg/kg/day q8h","mode":"weight","min":6,"max":6,"unit":"mg","period":"day","frequency":"q8h","split":3}]},{"no":3,"name":"Ivermectin","dose":["0.2mg/kg single dose"],"formulations":["Tab – 6mg, 12mg"],"calc":[{"label":"0.2mg/kg single dose","mode":"weight","min":0.2,"max":0.2,"unit":"mg","period":"dose","frequency":"single dose"}]}]},{"roman":"III","title":"Analgesics","drugs":[{"no":1,"name":"Diclofenac","dose":["1mg/kg/dose q8h"],"formulations":["Tab – 50mg"],"calc":[{"label":"1mg/kg/dose q8h","mode":"weight","min":1,"max":1,"unit":"mg","period":"dose","frequency":"q8h"}]},{"no":2,"name":"Ibuprofen","dose":["8mg/kg/dose q8h"],"formulations":["Tab – 400","Syp 100/5"],"calc":[{"label":"8mg/kg/dose q8h","mode":"weight","min":8,"max":8,"unit":"mg","period":"dose","frequency":"q8h"}]},{"no":3,"name":"Mefenamic acid","dose":["8mg/kg/dose q8h"],"formulations":["Tab – 100mg, 250mg, 500mg","Syp – 50/5, 100/5"],"calc":[{"label":"8mg/kg/dose q8h","mode":"weight","min":8,"max":8,"unit":"mg","period":"dose","frequency":"q8h"}]},{"no":4,"name":"Paracetamol","dose":["15mg/kg/dose q6h"],"formulations":["Tab – 500, 650","Syp – 125/5, 250/5","Dps – 100/1","Ampoule – 2ml, 150mg/1ml"],"calc":[{"label":"15mg/kg/dose q6h","mode":"weight","min":15,"max":15,"unit":"mg","period":"dose","frequency":"q6h"}]}]},{"roman":"IV","title":"Anti emetics","drugs":[{"no":1,"name":"Domperidone","dose":["0.2-0.4mg/kg/dose q8h"],"formulations":["Dps – 10/1","Syp – 1/1","Tab – 10mg"],"calc":[{"label":"0.2-0.4mg/kg/dose q8h","mode":"weight","min":0.2,"max":0.4,"unit":"mg","period":"dose","frequency":"q8h"}]},{"no":2,"name":"Ondansetron","dose":["0.1mg/kg/dose q8h"],"formulations":["Syp – 2/5","Tab – 2mg,4mg"],"calc":[{"label":"0.1mg/kg/dose q8h","mode":"weight","min":0.1,"max":0.1,"unit":"mg","period":"dose","frequency":"q8h"}]}]},{"roman":"V","title":"Anti Histaminic","drugs":[{"no":1,"name":"Cetirizine","dose":["6m-2y – 2.5mg HS","2-6yrs – 5mg HS",">6yrs – 5-10 mg HS"],"formulations":["Tab 10mg","Syp 5/5"],"calc":[{"label":"Sipas moshës","mode":"ageBands","bands":[{"minMonths":6,"maxMonths":24,"min":2.5,"max":2.5,"unit":"mg","frequency":"HS","source":"6m-2y – 2.5mg HS","maxInclusive":false},{"minMonths":24,"maxMonths":72,"min":5,"max":5,"unit":"mg","frequency":"HS","source":"2-6yrs – 5mg HS","maxInclusive":true},{"minMonths":72,"min":5,"max":10,"unit":"mg","frequency":"HS","source":">6yrs – 5-10 mg HS","minInclusive":false}]}]},{"no":2,"name":"CPM","dose":["Oral - 0.1mg/kg/dose q8h"],"formulations":["Tab – 2mg, 4mg","Syp 4/5, 2/5"],"calc":[{"label":"Oral - 0.1mg/kg/dose q8h","mode":"weight","min":0.1,"max":0.1,"unit":"mg","period":"dose","frequency":"q8h"}]},{"no":3,"name":"Fexofenadine","dose":["6m -2y – 15mg BD","2-12 yr – 30mg BD",">12yr – 60mg BD"],"formulations":["Tab 120mg, 180mg","Syp 30/5"],"calc":[{"label":"Sipas moshës","mode":"ageBands","bands":[{"minMonths":6,"maxMonths":24,"min":15,"max":15,"unit":"mg","frequency":"BD","source":"6m -2y – 15mg BD","maxInclusive":false},{"minMonths":24,"maxMonths":144,"min":30,"max":30,"unit":"mg","frequency":"BD","source":"2-12 yr – 30mg BD","maxInclusive":true},{"minMonths":144,"min":60,"max":60,"unit":"mg","frequency":"BD","source":">12yr – 60mg BD","minInclusive":false}]}]},{"no":4,"name":"Levocetirizine","dose":["2-6yr – 0.125mg/kg/day HS",">6y – 2.5mg-5mg"],"formulations":["Syp 2.5/5","Tab 5mg"],"calc":[{"label":"2-6yr – 0.125mg/kg/day HS","mode":"ageWeight","minMonths":24,"maxMonths":72,"min":0.125,"max":0.125,"unit":"mg","period":"day","frequency":"HS","split":1,"minInclusive":true,"maxInclusive":true},{"label":">6y – 2.5mg-5mg","mode":"ageFixed","minMonths":72,"min":2.5,"max":5,"unit":"mg","frequency":"","minInclusive":false}]},{"no":5,"name":"Hydroxyzine","dose":["0.5mg/kg/dose q6h"],"formulations":["Tab 10mg, 25mg","Syp 10/5","Dps 6/1"],"calc":[{"label":"0.5mg/kg/dose q6h","mode":"weight","min":0.5,"max":0.5,"unit":"mg","period":"dose","frequency":"q6h"}]}]},{"roman":"VI","title":"Antiviral Agents","drugs":[{"no":1,"name":"Acyclovir","dose":["i.v – 10-20mg/kg/dose q8h","Oral – 80mg/kg/day q6h"],"formulations":["Tab – 200mg, 400mg, 800mg","Syp 400/5","Vial 250mg"],"calc":[{"label":"i.v – 10-20mg/kg/dose q8h","mode":"weight","min":10,"max":20,"unit":"mg","period":"dose","frequency":"q8h"},{"label":"Oral – 80mg/kg/day q6h","mode":"weight","min":80,"max":80,"unit":"mg","period":"day","frequency":"q6h","split":4}]},{"no":2,"name":"Oseltamivir","dose":["<3m – 12mg BD","3m -6m – 20mg BD","6m – 1yr – 25mg BD",">1y –","≤ 15kg – 30mgBD","15-23 kg – 45 mg BD","23-40kg – 60mg BD",">40kg – 75mg BD"],"formulations":["Cap – 30mg, 75mg","Syp 12/1"],"calc":[{"label":"Sipas moshës/peshës","mode":"oseltamivirBands","bands":[{"maxMonths":3,"min":12,"max":12,"unit":"mg","frequency":"BD","source":"<3m – 12mg BD","maxInclusive":false},{"minMonths":3,"maxMonths":6,"min":20,"max":20,"unit":"mg","frequency":"BD","source":"3m -6m – 20mg BD","minInclusive":true,"maxInclusive":false},{"minMonths":6,"maxMonths":12,"min":25,"max":25,"unit":"mg","frequency":"BD","source":"6m – 1yr – 25mg BD","minInclusive":true,"maxInclusive":true}],"weightBands":[{"maxKg":15,"min":30,"max":30,"unit":"mg","frequency":"BD","source":"≤ 15kg – 30mgBD","maxInclusive":true},{"minKg":15,"maxKg":23,"min":45,"max":45,"unit":"mg","frequency":"BD","source":"15-23 kg – 45 mg BD","minInclusive":false,"maxInclusive":true},{"minKg":23,"maxKg":40,"min":60,"max":60,"unit":"mg","frequency":"BD","source":"23-40kg – 60mg BD","minInclusive":false,"maxInclusive":true},{"minKg":40,"min":75,"max":75,"unit":"mg","frequency":"BD","source":">40kg – 75mg BD","minInclusive":false}]}]}]},{"roman":"VII","title":"Bronchodilators","drugs":[{"no":1,"name":"Salbutamol","dose":["Oral - 0.1mg/kg/dose q8h","Nebulisation – 0.15mg/kg/dose","MDI – 2 -4 puffs"],"formulations":["Syp -2/5","Tab – 2mg, 4mg","MDI – 100mcg","Respiratory solution – 5mg/1ml","Respules – 2.5mg/2.5ml"],"calc":[{"label":"Oral - 0.1mg/kg/dose q8h","mode":"weight","min":0.1,"max":0.1,"unit":"mg","period":"dose","frequency":"q8h"},{"label":"Nebulisation – 0.15mg/kg/dose","mode":"weight","min":0.15,"max":0.15,"unit":"mg","period":"dose","frequency":""},{"label":"MDI – 2 -4 puffs","mode":"fixed","min":2,"max":4,"unit":"puffs","period":"dose","frequency":""}]},{"no":2,"name":"Levo salbutamol","dose":["Half dose of Salbutamol"],"formulations":["Syp – 1/5","MDI 50mcg","Respules – 0.63mg/2.5ml","Duolin Respules – Levosalb 1.25mg + Ipravent 500mcg/2.5ml"],"calc":[{"label":"Half dose of Salbutamol · Oral","mode":"weight","min":0.05,"max":0.05,"unit":"mg","period":"dose","frequency":"q8h"},{"label":"Half dose of Salbutamol · Nebulisation","mode":"weight","min":0.075,"max":0.075,"unit":"mg","period":"dose","frequency":""},{"label":"Half dose of Salbutamol · MDI","mode":"fixed","min":1,"max":2,"unit":"puffs","period":"dose","frequency":""}]},{"no":3,"name":"Montelukast","dose":["2-5yr – 4mg OD","6-14 yr – 5mg OD",">14y – 10mg OD"],"formulations":["Tab – 4,5,10 mg","Syp – 4/5"],"calc":[{"label":"Sipas moshës","mode":"ageBands","bands":[{"minMonths":24,"maxMonths":60,"min":4,"max":4,"unit":"mg","frequency":"OD","source":"2-5yr – 4mg OD","maxInclusive":true},{"minMonths":72,"maxMonths":168,"min":5,"max":5,"unit":"mg","frequency":"OD","source":"6-14 yr – 5mg OD","maxInclusive":true},{"minMonths":168,"min":10,"max":10,"unit":"mg","frequency":"OD","source":">14y – 10mg OD","minInclusive":false}]}]}]},{"roman":"VIII","title":"Steroids","drugs":[{"no":1,"name":"Prednisolone","dose":["1-2mg/kg/day q8h"],"formulations":["Syp – 5/5","Tab – 5mg, 10mg, 20mg"],"calc":[{"label":"1-2mg/kg/day q8h","mode":"weight","min":1,"max":2,"unit":"mg","period":"day","frequency":"q8h","split":3}]}]},{"roman":"IX","title":"Anti Gastritis","drugs":[{"no":1,"name":"Pantoprazole","dose":["1-2mg/kg/day","Infusion – 0.2mg/kg/hr"],"formulations":["Tab – 40mg","Vial – 40mg"],"calc":[{"label":"1-2mg/kg/day","mode":"weight","min":1,"max":2,"unit":"mg","period":"day","frequency":""},{"label":"Infusion – 0.2mg/kg/hr","mode":"weight","min":0.2,"max":0.2,"unit":"mg","period":"hour","frequency":"infusion"}]},{"no":2,"name":"Lansoprazole","dose":["1mg/kg/day"],"formulations":["Tab – 15mg. 30mg"],"calc":[{"label":"1mg/kg/day","mode":"weight","min":1,"max":1,"unit":"mg","period":"day","frequency":""}]},{"no":3,"name":"Ranitidine","dose":["Oral -3mg/kg/dose BD","i.v – 1mg/kg/dose q8h"],"formulations":["Tab 150mg","Syp 75/5","Injection – 25mg/1 , 2ml ampoule"],"calc":[{"label":"Oral -3mg/kg/dose BD","mode":"weight","min":3,"max":3,"unit":"mg","period":"dose","frequency":"BD"},{"label":"i.v – 1mg/kg/dose q8h","mode":"weight","min":1,"max":1,"unit":"mg","period":"dose","frequency":"q8h"}]}]},{"roman":"X","title":"Miscellaneous","drugs":[{"no":1,"name":"Iron","dose":["3mg/kg/day"],"formulations":["Iron drops – 20/1"],"calc":[{"label":"3mg/kg/day","mode":"weight","min":3,"max":3,"unit":"mg","period":"day","frequency":""}]},{"no":2,"name":"Calcium","dose":["50-150mg/kg/day"],"formulations":["Tab 250, 500"],"calc":[{"label":"50-150mg/kg/day","mode":"weight","min":50,"max":150,"unit":"mg","period":"day","frequency":""}]}]}]}$pediatric_json$::jsonb,
  now()
)
on conflict (dataset_key) do update set
  version = excluded.version,
  source_kind = excluded.source_kind,
  source_date = excluded.source_date,
  source_title = excluded.source_title,
  git_commit_sha = excluded.git_commit_sha,
  payload = excluded.payload,
  updated_at = now();

insert into public.pediatric_common_reference_rows_v1 (
  snapshot_id, section_order, section_roman, section_title,
  drug_order, drug_no, drug_name, dose_lines, formulation_lines, calculator, source_row, updated_at
)
select
  s.id,
  section_ord::integer,
  section_value->>'roman',
  section_value->>'title',
  drug_ord::integer,
  (drug_value->>'no')::integer,
  drug_value->>'name',
  drug_value->'dose',
  drug_value->'formulations',
  coalesce(drug_value->'calc', '[]'::jsonb),
  drug_value,
  now()
from public.pediatric_common_reference_snapshots_v1 s
cross join lateral jsonb_array_elements(s.payload->'sections') with ordinality as sections(section_value, section_ord)
cross join lateral jsonb_array_elements(section_value->'drugs') with ordinality as drugs(drug_value, drug_ord)
where s.dataset_key = 'pediatric_common_drugs_20260928'
on conflict (snapshot_id, section_order, drug_order) do update set
  section_roman = excluded.section_roman,
  section_title = excluded.section_title,
  drug_no = excluded.drug_no,
  drug_name = excluded.drug_name,
  dose_lines = excluded.dose_lines,
  formulation_lines = excluded.formulation_lines,
  calculator = excluded.calculator,
  source_row = excluded.source_row,
  updated_at = now();

comment on table public.pediatric_common_reference_snapshots_v1 is
  'Exact database snapshot of the user-supplied Pediatric Doses of Common Drugs table. Source-exact reference, not independently clinical-verified.';
comment on table public.pediatric_common_reference_rows_v1 is
  'Query-friendly row projection of the source-exact pediatric common-drug reference snapshot.';
