
-- DRx Phase 11F: ingest one high-priority official emc SmPC source snapshot.
-- Source: Co-amoxiclav 875mg/125mg film-coated Tablets, emc product 10877.
-- Capture is normalized text from the public SmPC page and explicitly marked as such.

with payload as (
  select
    $raw$Source: emc product 10877
Title: Co-amoxiclav 875mg/125mg film-coated Tablets
Active ingredients: amoxicillin trihydrate; clavulanic acid
ATC: J01CR02
Last updated on emc: 02 Dec 2025
URL: https://www.medicines.org.uk/emc/product/10877/smpc

4.1 Therapeutic indications
Co-amoxiclav is indicated for the treatment of the following infections in adults and children (see sections 4.2, 4.4 and 5.1).

• Acute bacterial sinusitis (adequately diagnosed)
• Acute otitis media
• Acute exacerbations of chronic bronchitis (adequately diagnosed)
• Community acquired pneumonia
• Cystitis
• Pyelonephritis
• Skin and soft tissue infections in particular cellulitis, animal bites, severe dental abscess with spreading cellulitis.
• Bone and joint infections, in particular osteomyelitis

Consideration should be given to official guidance on the appropriate use of antibacterial agents.

4.2 Posology and method of administration
Posology

Doses are expressed throughout in terms of amoxicillin/clavulanic acid content except when doses are stated in terms of an individual component.

The dose of Co-amoxiclav that is selected to treat an individual infection should take into account:
• The expected pathogens and their likely susceptibility to antibacterial agents (see section 4.4)
• The severity and the site of the infection
• The age, weight and renal function of the patient as shown below.

The use of alternative presentations of amoxicillin/clavulanic acid (e.g. those that provide higher doses of amoxicillin and/or different ratios of amoxicillin to clavulanic acid) should be considered as necessary (see sections 4.4 and 5.1).

For adults and children ≥ 40 kg, this formulation of Co-amoxiclav provides a total daily dose of 1750 mg amoxicillin/250 mg clavulanic acid with twice daily dosing and 2625 mg amoxicillin/375 mg clavulanic acid with three times daily dosing, when administered as recommended below. For children < 40 kg, this formulation of Co-amoxiclav provides a maximum daily dose of 1000-2800 mg amoxicillin/143-400 mg clavulanic acid, when administered as recommended below.

If it is considered that a higher daily dose of amoxicillin is required, it is recommended that another preparation of amoxicillin/clavulanic acid is selected in order to avoid administration of unnecessarily high daily doses of clavulanic acid (see sections 4.4 and 5.1).

The duration of therapy should be determined by the response of the patient. Some infections (e.g. osteomyelitis) require longer periods of treatment. Treatment should not be extended beyond 14 days without review (see section 4.4 regarding prolonged therapy).

Adults and children ≥ 40 kg

Recommended doses:
• standard dose: (for all indications) 875 mg/125 mg two times a day;
• higher dose - (particularly for infections such as otitis media, sinusitis, lower respiratory tract infections and urinary tract infections): 875 mg/125 mg three times a day.

Children < 40 kg

Children may be treated with Co-Amoxiclav tablets, suspensions or paediatric sachets.

Recommended doses:
• 25 mg/3.6 mg/kg/day to 45 mg/6.4 mg/kg/day given as two divided doses.
• up to 70 mg/10 mg/kg/day given as two divided doses may be considered for some infections (such as otitis media, sinusitis and lower respiratory tract infections).

As the tablets cannot be divided children weighing less than 25 kg must not be treated with Co-Amoxiclav tablets.

The table below presents the received dose (mg/kg body weight) in children weighing 25 kg to 40 kg upon administering a single 875 mg/125 mg tablet.
Body weight [kg] | 40 | 35 | 30 | 25 | Single dose recommended [mg/kg body weight] (see above)
Amoxicillin [mg/kg body weight] per single dose (1 film-coated tablet) | 21.9 | 25.0 | 29.2 | 35.0 | 12.5 – 22.5 (up to 35)
Clavulanic acid [mg/kg body weight] per single dose (1 filmcoated tablet) | 3.1 | 3.6 | 4.2 | 5.0 | 1.8 – 3.2 (up to 5)

Children weighing less than 25 kg should preferably be treated with Co-Amoxiclav suspension or paediatric sachets.
No clinical data are available on doses of amoxicillin/clavulanic acid 7:1 formulations regarding doses higher than 45 mg/6.4 mg/kg per day in children under 2 years.
There are no clinical data for amoxicillin/clavulanic acid 7:1 formulations for patients under 2 months of age. Dosing recommendations in this population therefore cannot be made.

Elderly
No dose adjustment is considered necessary.

Renal impairment
No adjustment in dose is required in patients with creatinine clearance (CrCl) greater than 30 ml/min.
In patients with creatinine clearance less than 30 ml/min, the use of Co-Amoxiclav presentations with an amoxicillin to clavulanic acid ratio of 7:1 is not recommended, as no recommendations for dose adjustments are available.

Hepatic impairment
Dose with caution and monitor hepatic function at regular intervals (see sections 4.3 and 4.4).

Method of administration
Co-amoxiclav is for oral use.
Administer with a meal to minimise potential gastrointestinal intolerance. Therapy can be started parenterally and continued with an oral preparation.$raw$::text as raw_text,

    $s41$Co-amoxiclav is indicated for the treatment of the following infections in adults and children (see sections 4.2, 4.4 and 5.1).

• Acute bacterial sinusitis (adequately diagnosed)
• Acute otitis media
• Acute exacerbations of chronic bronchitis (adequately diagnosed)
• Community acquired pneumonia
• Cystitis
• Pyelonephritis
• Skin and soft tissue infections in particular cellulitis, animal bites, severe dental abscess with spreading cellulitis.
• Bone and joint infections, in particular osteomyelitis

Consideration should be given to official guidance on the appropriate use of antibacterial agents.$s41$::text as section_41,

    $s42$Posology

Doses are expressed throughout in terms of amoxicillin/clavulanic acid content except when doses are stated in terms of an individual component.

The dose of Co-amoxiclav that is selected to treat an individual infection should take into account:
• The expected pathogens and their likely susceptibility to antibacterial agents (see section 4.4)
• The severity and the site of the infection
• The age, weight and renal function of the patient as shown below.

The use of alternative presentations of amoxicillin/clavulanic acid (e.g. those that provide higher doses of amoxicillin and/or different ratios of amoxicillin to clavulanic acid) should be considered as necessary (see sections 4.4 and 5.1).

For adults and children ≥ 40 kg, this formulation of Co-amoxiclav provides a total daily dose of 1750 mg amoxicillin/250 mg clavulanic acid with twice daily dosing and 2625 mg amoxicillin/375 mg clavulanic acid with three times daily dosing, when administered as recommended below. For children < 40 kg, this formulation of Co-amoxiclav provides a maximum daily dose of 1000-2800 mg amoxicillin/143-400 mg clavulanic acid, when administered as recommended below.

If it is considered that a higher daily dose of amoxicillin is required, it is recommended that another preparation of amoxicillin/clavulanic acid is selected in order to avoid administration of unnecessarily high daily doses of clavulanic acid (see sections 4.4 and 5.1).

The duration of therapy should be determined by the response of the patient. Some infections (e.g. osteomyelitis) require longer periods of treatment. Treatment should not be extended beyond 14 days without review (see section 4.4 regarding prolonged therapy).

Adults and children ≥ 40 kg

Recommended doses:
• standard dose: (for all indications) 875 mg/125 mg two times a day;
• higher dose - (particularly for infections such as otitis media, sinusitis, lower respiratory tract infections and urinary tract infections): 875 mg/125 mg three times a day.

Children < 40 kg

Children may be treated with Co-Amoxiclav tablets, suspensions or paediatric sachets.

Recommended doses:
• 25 mg/3.6 mg/kg/day to 45 mg/6.4 mg/kg/day given as two divided doses.
• up to 70 mg/10 mg/kg/day given as two divided doses may be considered for some infections (such as otitis media, sinusitis and lower respiratory tract infections).

As the tablets cannot be divided children weighing less than 25 kg must not be treated with Co-Amoxiclav tablets.

The table below presents the received dose (mg/kg body weight) in children weighing 25 kg to 40 kg upon administering a single 875 mg/125 mg tablet.
Body weight [kg] | 40 | 35 | 30 | 25 | Single dose recommended [mg/kg body weight] (see above)
Amoxicillin [mg/kg body weight] per single dose (1 film-coated tablet) | 21.9 | 25.0 | 29.2 | 35.0 | 12.5 – 22.5 (up to 35)
Clavulanic acid [mg/kg body weight] per single dose (1 filmcoated tablet) | 3.1 | 3.6 | 4.2 | 5.0 | 1.8 – 3.2 (up to 5)

Children weighing less than 25 kg should preferably be treated with Co-Amoxiclav suspension or paediatric sachets.
No clinical data are available on doses of amoxicillin/clavulanic acid 7:1 formulations regarding doses higher than 45 mg/6.4 mg/kg per day in children under 2 years.
There are no clinical data for amoxicillin/clavulanic acid 7:1 formulations for patients under 2 months of age. Dosing recommendations in this population therefore cannot be made.

Elderly
No dose adjustment is considered necessary.

Renal impairment
No adjustment in dose is required in patients with creatinine clearance (CrCl) greater than 30 ml/min.
In patients with creatinine clearance less than 30 ml/min, the use of Co-Amoxiclav presentations with an amoxicillin to clavulanic acid ratio of 7:1 is not recommended, as no recommendations for dose adjustments are available.

Hepatic impairment
Dose with caution and monitor hepatic function at regular intervals (see sections 4.3 and 4.4).

Method of administration
Co-amoxiclav is for oral use.
Administer with a meal to minimise potential gastrointestinal intolerance. Therapy can be started parenterally and continued with an oral preparation.$s42$::text as section_42
),
hashed as (
  select
    *,
    encode(digest(raw_text,'sha256'),'hex') as snapshot_id,
    encode(digest(section_41,'sha256'),'hex') as section_41_sha256,
    encode(digest(section_42,'sha256'),'hex') as section_42_sha256
  from payload
)
insert into public.dose_source_snapshots_v3(
  snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
  document_type,document_version,document_date,fetched_at,content_type,content_length,
  raw_sha256,parser_version,archive_locator
)
select
  snapshot_id,
  'EMC-PRODUCT-10877-SMPC',
  'https://www.medicines.org.uk/emc/product/10877/smpc',
  'https://www.medicines.org.uk/emc/product/10877/smpc',
  'EMC',
  'electronic Medicines Compendium (emc)',
  'United Kingdom',
  'SmPC',
  'emc-update-2025-12-02',
  date '2025-12-02',
  now(),
  'text/plain; charset=utf-8; profile=drx-normalized-web-capture',
  octet_length(raw_text),
  snapshot_id,
  'drx-web-normalized-capture-v1',
  'https://www.medicines.org.uk/emc/product/10877/smpc'
from hashed
on conflict (snapshot_id) do nothing;

with payload as (
  select
    $raw$Source: emc product 10877
Title: Co-amoxiclav 875mg/125mg film-coated Tablets
Active ingredients: amoxicillin trihydrate; clavulanic acid
ATC: J01CR02
Last updated on emc: 02 Dec 2025
URL: https://www.medicines.org.uk/emc/product/10877/smpc

4.1 Therapeutic indications
Co-amoxiclav is indicated for the treatment of the following infections in adults and children (see sections 4.2, 4.4 and 5.1).

• Acute bacterial sinusitis (adequately diagnosed)
• Acute otitis media
• Acute exacerbations of chronic bronchitis (adequately diagnosed)
• Community acquired pneumonia
• Cystitis
• Pyelonephritis
• Skin and soft tissue infections in particular cellulitis, animal bites, severe dental abscess with spreading cellulitis.
• Bone and joint infections, in particular osteomyelitis

Consideration should be given to official guidance on the appropriate use of antibacterial agents.

4.2 Posology and method of administration
Posology

Doses are expressed throughout in terms of amoxicillin/clavulanic acid content except when doses are stated in terms of an individual component.

The dose of Co-amoxiclav that is selected to treat an individual infection should take into account:
• The expected pathogens and their likely susceptibility to antibacterial agents (see section 4.4)
• The severity and the site of the infection
• The age, weight and renal function of the patient as shown below.

The use of alternative presentations of amoxicillin/clavulanic acid (e.g. those that provide higher doses of amoxicillin and/or different ratios of amoxicillin to clavulanic acid) should be considered as necessary (see sections 4.4 and 5.1).

For adults and children ≥ 40 kg, this formulation of Co-amoxiclav provides a total daily dose of 1750 mg amoxicillin/250 mg clavulanic acid with twice daily dosing and 2625 mg amoxicillin/375 mg clavulanic acid with three times daily dosing, when administered as recommended below. For children < 40 kg, this formulation of Co-amoxiclav provides a maximum daily dose of 1000-2800 mg amoxicillin/143-400 mg clavulanic acid, when administered as recommended below.

If it is considered that a higher daily dose of amoxicillin is required, it is recommended that another preparation of amoxicillin/clavulanic acid is selected in order to avoid administration of unnecessarily high daily doses of clavulanic acid (see sections 4.4 and 5.1).

The duration of therapy should be determined by the response of the patient. Some infections (e.g. osteomyelitis) require longer periods of treatment. Treatment should not be extended beyond 14 days without review (see section 4.4 regarding prolonged therapy).

Adults and children ≥ 40 kg

Recommended doses:
• standard dose: (for all indications) 875 mg/125 mg two times a day;
• higher dose - (particularly for infections such as otitis media, sinusitis, lower respiratory tract infections and urinary tract infections): 875 mg/125 mg three times a day.

Children < 40 kg

Children may be treated with Co-Amoxiclav tablets, suspensions or paediatric sachets.

Recommended doses:
• 25 mg/3.6 mg/kg/day to 45 mg/6.4 mg/kg/day given as two divided doses.
• up to 70 mg/10 mg/kg/day given as two divided doses may be considered for some infections (such as otitis media, sinusitis and lower respiratory tract infections).

As the tablets cannot be divided children weighing less than 25 kg must not be treated with Co-Amoxiclav tablets.

The table below presents the received dose (mg/kg body weight) in children weighing 25 kg to 40 kg upon administering a single 875 mg/125 mg tablet.
Body weight [kg] | 40 | 35 | 30 | 25 | Single dose recommended [mg/kg body weight] (see above)
Amoxicillin [mg/kg body weight] per single dose (1 film-coated tablet) | 21.9 | 25.0 | 29.2 | 35.0 | 12.5 – 22.5 (up to 35)
Clavulanic acid [mg/kg body weight] per single dose (1 filmcoated tablet) | 3.1 | 3.6 | 4.2 | 5.0 | 1.8 – 3.2 (up to 5)

Children weighing less than 25 kg should preferably be treated with Co-Amoxiclav suspension or paediatric sachets.
No clinical data are available on doses of amoxicillin/clavulanic acid 7:1 formulations regarding doses higher than 45 mg/6.4 mg/kg per day in children under 2 years.
There are no clinical data for amoxicillin/clavulanic acid 7:1 formulations for patients under 2 months of age. Dosing recommendations in this population therefore cannot be made.

Elderly
No dose adjustment is considered necessary.

Renal impairment
No adjustment in dose is required in patients with creatinine clearance (CrCl) greater than 30 ml/min.
In patients with creatinine clearance less than 30 ml/min, the use of Co-Amoxiclav presentations with an amoxicillin to clavulanic acid ratio of 7:1 is not recommended, as no recommendations for dose adjustments are available.

Hepatic impairment
Dose with caution and monitor hepatic function at regular intervals (see sections 4.3 and 4.4).

Method of administration
Co-amoxiclav is for oral use.
Administer with a meal to minimise potential gastrointestinal intolerance. Therapy can be started parenterally and continued with an oral preparation.$raw$::text as raw_text,

    $s41$Co-amoxiclav is indicated for the treatment of the following infections in adults and children (see sections 4.2, 4.4 and 5.1).

• Acute bacterial sinusitis (adequately diagnosed)
• Acute otitis media
• Acute exacerbations of chronic bronchitis (adequately diagnosed)
• Community acquired pneumonia
• Cystitis
• Pyelonephritis
• Skin and soft tissue infections in particular cellulitis, animal bites, severe dental abscess with spreading cellulitis.
• Bone and joint infections, in particular osteomyelitis

Consideration should be given to official guidance on the appropriate use of antibacterial agents.$s41$::text as section_41,

    $s42$Posology

Doses are expressed throughout in terms of amoxicillin/clavulanic acid content except when doses are stated in terms of an individual component.

The dose of Co-amoxiclav that is selected to treat an individual infection should take into account:
• The expected pathogens and their likely susceptibility to antibacterial agents (see section 4.4)
• The severity and the site of the infection
• The age, weight and renal function of the patient as shown below.

The use of alternative presentations of amoxicillin/clavulanic acid (e.g. those that provide higher doses of amoxicillin and/or different ratios of amoxicillin to clavulanic acid) should be considered as necessary (see sections 4.4 and 5.1).

For adults and children ≥ 40 kg, this formulation of Co-amoxiclav provides a total daily dose of 1750 mg amoxicillin/250 mg clavulanic acid with twice daily dosing and 2625 mg amoxicillin/375 mg clavulanic acid with three times daily dosing, when administered as recommended below. For children < 40 kg, this formulation of Co-amoxiclav provides a maximum daily dose of 1000-2800 mg amoxicillin/143-400 mg clavulanic acid, when administered as recommended below.

If it is considered that a higher daily dose of amoxicillin is required, it is recommended that another preparation of amoxicillin/clavulanic acid is selected in order to avoid administration of unnecessarily high daily doses of clavulanic acid (see sections 4.4 and 5.1).

The duration of therapy should be determined by the response of the patient. Some infections (e.g. osteomyelitis) require longer periods of treatment. Treatment should not be extended beyond 14 days without review (see section 4.4 regarding prolonged therapy).

Adults and children ≥ 40 kg

Recommended doses:
• standard dose: (for all indications) 875 mg/125 mg two times a day;
• higher dose - (particularly for infections such as otitis media, sinusitis, lower respiratory tract infections and urinary tract infections): 875 mg/125 mg three times a day.

Children < 40 kg

Children may be treated with Co-Amoxiclav tablets, suspensions or paediatric sachets.

Recommended doses:
• 25 mg/3.6 mg/kg/day to 45 mg/6.4 mg/kg/day given as two divided doses.
• up to 70 mg/10 mg/kg/day given as two divided doses may be considered for some infections (such as otitis media, sinusitis and lower respiratory tract infections).

As the tablets cannot be divided children weighing less than 25 kg must not be treated with Co-Amoxiclav tablets.

The table below presents the received dose (mg/kg body weight) in children weighing 25 kg to 40 kg upon administering a single 875 mg/125 mg tablet.
Body weight [kg] | 40 | 35 | 30 | 25 | Single dose recommended [mg/kg body weight] (see above)
Amoxicillin [mg/kg body weight] per single dose (1 film-coated tablet) | 21.9 | 25.0 | 29.2 | 35.0 | 12.5 – 22.5 (up to 35)
Clavulanic acid [mg/kg body weight] per single dose (1 filmcoated tablet) | 3.1 | 3.6 | 4.2 | 5.0 | 1.8 – 3.2 (up to 5)

Children weighing less than 25 kg should preferably be treated with Co-Amoxiclav suspension or paediatric sachets.
No clinical data are available on doses of amoxicillin/clavulanic acid 7:1 formulations regarding doses higher than 45 mg/6.4 mg/kg per day in children under 2 years.
There are no clinical data for amoxicillin/clavulanic acid 7:1 formulations for patients under 2 months of age. Dosing recommendations in this population therefore cannot be made.

Elderly
No dose adjustment is considered necessary.

Renal impairment
No adjustment in dose is required in patients with creatinine clearance (CrCl) greater than 30 ml/min.
In patients with creatinine clearance less than 30 ml/min, the use of Co-Amoxiclav presentations with an amoxicillin to clavulanic acid ratio of 7:1 is not recommended, as no recommendations for dose adjustments are available.

Hepatic impairment
Dose with caution and monitor hepatic function at regular intervals (see sections 4.3 and 4.4).

Method of administration
Co-amoxiclav is for oral use.
Administer with a meal to minimise potential gastrointestinal intolerance. Therapy can be started parenterally and continued with an oral preparation.$s42$::text as section_42
),
hashed as (
  select
    *,
    encode(digest(raw_text,'sha256'),'hex') as snapshot_id,
    encode(digest(section_41,'sha256'),'hex') as section_41_sha256,
    encode(digest(section_42,'sha256'),'hex') as section_42_sha256
  from payload
)
insert into public.dose_source_sections_v3(
  snapshot_id,section_code,section_key,heading,section_text,section_sha256,
  extracted_json,parser_version,extraction_status
)
select snapshot_id,'4.1','section-4.1','Therapeutic indications',section_41,section_41_sha256,
       jsonb_build_object(
         'captureMethod','normalized_public_web_capture',
         'sourceUrl','https://www.medicines.org.uk/emc/product/10877/smpc',
         'sourceLineRange','230-249'
       ),
       'drx-web-normalized-capture-v1','extracted'
from hashed
on conflict (snapshot_id,section_code) do nothing;

with payload as (
  select
    $raw$Source: emc product 10877
Title: Co-amoxiclav 875mg/125mg film-coated Tablets
Active ingredients: amoxicillin trihydrate; clavulanic acid
ATC: J01CR02
Last updated on emc: 02 Dec 2025
URL: https://www.medicines.org.uk/emc/product/10877/smpc

4.1 Therapeutic indications
Co-amoxiclav is indicated for the treatment of the following infections in adults and children (see sections 4.2, 4.4 and 5.1).

• Acute bacterial sinusitis (adequately diagnosed)
• Acute otitis media
• Acute exacerbations of chronic bronchitis (adequately diagnosed)
• Community acquired pneumonia
• Cystitis
• Pyelonephritis
• Skin and soft tissue infections in particular cellulitis, animal bites, severe dental abscess with spreading cellulitis.
• Bone and joint infections, in particular osteomyelitis

Consideration should be given to official guidance on the appropriate use of antibacterial agents.

4.2 Posology and method of administration
Posology

Doses are expressed throughout in terms of amoxicillin/clavulanic acid content except when doses are stated in terms of an individual component.

The dose of Co-amoxiclav that is selected to treat an individual infection should take into account:
• The expected pathogens and their likely susceptibility to antibacterial agents (see section 4.4)
• The severity and the site of the infection
• The age, weight and renal function of the patient as shown below.

The use of alternative presentations of amoxicillin/clavulanic acid (e.g. those that provide higher doses of amoxicillin and/or different ratios of amoxicillin to clavulanic acid) should be considered as necessary (see sections 4.4 and 5.1).

For adults and children ≥ 40 kg, this formulation of Co-amoxiclav provides a total daily dose of 1750 mg amoxicillin/250 mg clavulanic acid with twice daily dosing and 2625 mg amoxicillin/375 mg clavulanic acid with three times daily dosing, when administered as recommended below. For children < 40 kg, this formulation of Co-amoxiclav provides a maximum daily dose of 1000-2800 mg amoxicillin/143-400 mg clavulanic acid, when administered as recommended below.

If it is considered that a higher daily dose of amoxicillin is required, it is recommended that another preparation of amoxicillin/clavulanic acid is selected in order to avoid administration of unnecessarily high daily doses of clavulanic acid (see sections 4.4 and 5.1).

The duration of therapy should be determined by the response of the patient. Some infections (e.g. osteomyelitis) require longer periods of treatment. Treatment should not be extended beyond 14 days without review (see section 4.4 regarding prolonged therapy).

Adults and children ≥ 40 kg

Recommended doses:
• standard dose: (for all indications) 875 mg/125 mg two times a day;
• higher dose - (particularly for infections such as otitis media, sinusitis, lower respiratory tract infections and urinary tract infections): 875 mg/125 mg three times a day.

Children < 40 kg

Children may be treated with Co-Amoxiclav tablets, suspensions or paediatric sachets.

Recommended doses:
• 25 mg/3.6 mg/kg/day to 45 mg/6.4 mg/kg/day given as two divided doses.
• up to 70 mg/10 mg/kg/day given as two divided doses may be considered for some infections (such as otitis media, sinusitis and lower respiratory tract infections).

As the tablets cannot be divided children weighing less than 25 kg must not be treated with Co-Amoxiclav tablets.

The table below presents the received dose (mg/kg body weight) in children weighing 25 kg to 40 kg upon administering a single 875 mg/125 mg tablet.
Body weight [kg] | 40 | 35 | 30 | 25 | Single dose recommended [mg/kg body weight] (see above)
Amoxicillin [mg/kg body weight] per single dose (1 film-coated tablet) | 21.9 | 25.0 | 29.2 | 35.0 | 12.5 – 22.5 (up to 35)
Clavulanic acid [mg/kg body weight] per single dose (1 filmcoated tablet) | 3.1 | 3.6 | 4.2 | 5.0 | 1.8 – 3.2 (up to 5)

Children weighing less than 25 kg should preferably be treated with Co-Amoxiclav suspension or paediatric sachets.
No clinical data are available on doses of amoxicillin/clavulanic acid 7:1 formulations regarding doses higher than 45 mg/6.4 mg/kg per day in children under 2 years.
There are no clinical data for amoxicillin/clavulanic acid 7:1 formulations for patients under 2 months of age. Dosing recommendations in this population therefore cannot be made.

Elderly
No dose adjustment is considered necessary.

Renal impairment
No adjustment in dose is required in patients with creatinine clearance (CrCl) greater than 30 ml/min.
In patients with creatinine clearance less than 30 ml/min, the use of Co-Amoxiclav presentations with an amoxicillin to clavulanic acid ratio of 7:1 is not recommended, as no recommendations for dose adjustments are available.

Hepatic impairment
Dose with caution and monitor hepatic function at regular intervals (see sections 4.3 and 4.4).

Method of administration
Co-amoxiclav is for oral use.
Administer with a meal to minimise potential gastrointestinal intolerance. Therapy can be started parenterally and continued with an oral preparation.$raw$::text as raw_text,

    $s42$Posology

Doses are expressed throughout in terms of amoxicillin/clavulanic acid content except when doses are stated in terms of an individual component.

The dose of Co-amoxiclav that is selected to treat an individual infection should take into account:
• The expected pathogens and their likely susceptibility to antibacterial agents (see section 4.4)
• The severity and the site of the infection
• The age, weight and renal function of the patient as shown below.

The use of alternative presentations of amoxicillin/clavulanic acid (e.g. those that provide higher doses of amoxicillin and/or different ratios of amoxicillin to clavulanic acid) should be considered as necessary (see sections 4.4 and 5.1).

For adults and children ≥ 40 kg, this formulation of Co-amoxiclav provides a total daily dose of 1750 mg amoxicillin/250 mg clavulanic acid with twice daily dosing and 2625 mg amoxicillin/375 mg clavulanic acid with three times daily dosing, when administered as recommended below. For children < 40 kg, this formulation of Co-amoxiclav provides a maximum daily dose of 1000-2800 mg amoxicillin/143-400 mg clavulanic acid, when administered as recommended below.

If it is considered that a higher daily dose of amoxicillin is required, it is recommended that another preparation of amoxicillin/clavulanic acid is selected in order to avoid administration of unnecessarily high daily doses of clavulanic acid (see sections 4.4 and 5.1).

The duration of therapy should be determined by the response of the patient. Some infections (e.g. osteomyelitis) require longer periods of treatment. Treatment should not be extended beyond 14 days without review (see section 4.4 regarding prolonged therapy).

Adults and children ≥ 40 kg

Recommended doses:
• standard dose: (for all indications) 875 mg/125 mg two times a day;
• higher dose - (particularly for infections such as otitis media, sinusitis, lower respiratory tract infections and urinary tract infections): 875 mg/125 mg three times a day.

Children < 40 kg

Children may be treated with Co-Amoxiclav tablets, suspensions or paediatric sachets.

Recommended doses:
• 25 mg/3.6 mg/kg/day to 45 mg/6.4 mg/kg/day given as two divided doses.
• up to 70 mg/10 mg/kg/day given as two divided doses may be considered for some infections (such as otitis media, sinusitis and lower respiratory tract infections).

As the tablets cannot be divided children weighing less than 25 kg must not be treated with Co-Amoxiclav tablets.

The table below presents the received dose (mg/kg body weight) in children weighing 25 kg to 40 kg upon administering a single 875 mg/125 mg tablet.
Body weight [kg] | 40 | 35 | 30 | 25 | Single dose recommended [mg/kg body weight] (see above)
Amoxicillin [mg/kg body weight] per single dose (1 film-coated tablet) | 21.9 | 25.0 | 29.2 | 35.0 | 12.5 – 22.5 (up to 35)
Clavulanic acid [mg/kg body weight] per single dose (1 filmcoated tablet) | 3.1 | 3.6 | 4.2 | 5.0 | 1.8 – 3.2 (up to 5)

Children weighing less than 25 kg should preferably be treated with Co-Amoxiclav suspension or paediatric sachets.
No clinical data are available on doses of amoxicillin/clavulanic acid 7:1 formulations regarding doses higher than 45 mg/6.4 mg/kg per day in children under 2 years.
There are no clinical data for amoxicillin/clavulanic acid 7:1 formulations for patients under 2 months of age. Dosing recommendations in this population therefore cannot be made.

Elderly
No dose adjustment is considered necessary.

Renal impairment
No adjustment in dose is required in patients with creatinine clearance (CrCl) greater than 30 ml/min.
In patients with creatinine clearance less than 30 ml/min, the use of Co-Amoxiclav presentations with an amoxicillin to clavulanic acid ratio of 7:1 is not recommended, as no recommendations for dose adjustments are available.

Hepatic impairment
Dose with caution and monitor hepatic function at regular intervals (see sections 4.3 and 4.4).

Method of administration
Co-amoxiclav is for oral use.
Administer with a meal to minimise potential gastrointestinal intolerance. Therapy can be started parenterally and continued with an oral preparation.$s42$::text as section_42
),
hashed as (
  select
    *,
    encode(digest(raw_text,'sha256'),'hex') as snapshot_id,
    encode(digest(section_42,'sha256'),'hex') as section_42_sha256
  from payload
)
insert into public.dose_source_sections_v3(
  snapshot_id,section_code,section_key,heading,section_text,section_sha256,
  extracted_json,parser_version,extraction_status
)
select snapshot_id,'4.2','section-4.2','Posology and method of administration',section_42,section_42_sha256,
       jsonb_build_object(
         'captureMethod','normalized_public_web_capture',
         'sourceUrl','https://www.medicines.org.uk/emc/product/10877/smpc',
         'sourceLineRange','251-312'
       ),
       'drx-web-normalized-capture-v1','extracted'
from hashed
on conflict (snapshot_id,section_code) do nothing;
