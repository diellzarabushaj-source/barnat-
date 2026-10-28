-- Three reviewed antibiotic corrections only. No schema, roles or permissions change.
-- Idempotent, row-locked and guarded against concurrent clinical edits.
do $migration$
declare
  current_payload jsonb;
  drug_patch jsonb := $antibiotic_drug_patch${
  "Amoxicillin + Clavulanic": {
    "status": "verified-corrected",
    "badgeSq": "VERIFIKUAR · MSF / SmPC 2026",
    "summarySq": "Doza shprehet sipas komponentit amoksicilinë; raporti amoksicilinë/klavulanat dhe indikacioni kanë rëndësi.",
    "sources": [
      {
        "authority": "MSF",
        "title": "Amoxicillin/clavulanic acid oral",
        "url": "https://medicalguidelines.msf.org/en/viewport/EssDr/english/amoxicillin-clavulanic-acid-co-amoxiclav-oral-16685119.html"
      },
      {
        "authority": "MSF",
        "title": "Erysipelas and cellulitis",
        "url": "https://medicalguidelines.msf.org/en/viewport/CG/english/erysipelas-and-cellulitis-16689672.html"
      },
      {
        "authority": "emc SmPC 2026",
        "title": "Co-amoxiclav 1000/200 mg IV · paediatric posology",
        "url": "https://www.medicines.org.uk/emc/product/11108/smpc"
      }
    ],
    "calculator": {
      "replace": true,
      "options": [
        {
          "label": "Kafshim / AOM ose sinusit linjë e dytë · 25 mg/kg amoksicilinë · 2 herë/ditë",
          "mode": "clinicalRules",
          "route": "oral",
          "componentBasis": "amoxicillin",
          "rules": [
            {
              "maxKg": 40,
              "doseType": "weight",
              "min": 25,
              "max": 25,
              "unit": "mg",
              "period": "dose",
              "frequency": "2 herë/ditë",
              "source": "MSF · dose expressed as amoxicillin",
              "maxKgInclusive": false
            }
          ]
        },
        {
          "label": "Infeksion i rëndë · kalim parenteral→oral · 50 mg/kg amoksicilinë · 2 herë/ditë",
          "mode": "clinicalRules",
          "route": "oral",
          "componentBasis": "amoxicillin",
          "rules": [
            {
              "maxKg": 40,
              "doseType": "weight",
              "min": 50,
              "max": 50,
              "unit": "mg",
              "period": "dose",
              "frequency": "2 herë/ditë",
              "source": "MSF · dose expressed as amoxicillin",
              "maxKgInclusive": false
            }
          ]
        },
        {
          "label": "IV 1000/200 · <3 muaj ose <4 kg · 25/5 mg/kg q12h",
          "mode": "clinicalRules",
          "route": "injectable",
          "componentBasis": "amoxicillin",
          "rules": [
            {
              "maxMonths": 3,
              "maxInclusive": false,
              "doseType": "weight",
              "min": 25,
              "max": 25,
              "unit": "mg",
              "period": "dose",
              "frequency": "çdo 12 orë · IV (infuzion te <3 muaj)",
              "maxPerDose": 1000,
              "source": "emc SmPC 2026 · <3 months or <4 kg",
              "noteSq": "Klavulanat 5 mg/kg/dozë."
            },
            {
              "minMonths": 3,
              "maxKg": 4,
              "maxKgInclusive": false,
              "doseType": "weight",
              "min": 25,
              "max": 25,
              "unit": "mg",
              "period": "dose",
              "frequency": "çdo 12 orë · IV",
              "maxPerDose": 1000,
              "source": "emc SmPC 2026 · <4 kg",
              "noteSq": "Klavulanat 5 mg/kg/dozë."
            }
          ]
        },
        {
          "label": "IV 1000/200 · ≥3 muaj, 4–<40 kg · 25/5 mg/kg q8h",
          "mode": "clinicalRules",
          "route": "injectable",
          "componentBasis": "amoxicillin",
          "rules": [
            {
              "minMonths": 3,
              "minKg": 4,
              "maxKg": 40,
              "maxKgInclusive": false,
              "doseType": "weight",
              "min": 25,
              "max": 25,
              "unit": "mg",
              "period": "dose",
              "frequency": "çdo 8 orë · IV",
              "maxPerDose": 1000,
              "source": "emc SmPC 2026 · children <40 kg, ≥3 months",
              "noteSq": "Klavulanat 5 mg/kg/dozë."
            }
          ]
        },
        {
          "label": "IV 1000/200 · ≥40 kg · 1 g/200 mg q8h",
          "mode": "clinicalRules",
          "route": "injectable",
          "componentBasis": "amoxicillin",
          "rules": [
            {
              "minKg": 40,
              "doseType": "fixed",
              "min": 1000,
              "max": 1000,
              "unit": "mg",
              "period": "dose",
              "frequency": "çdo 8 orë · IV",
              "source": "emc SmPC 2026 · ≥40 kg",
              "noteSq": "Klavulanat 200 mg/dozë."
            }
          ]
        }
      ]
    },
    "kosovoMarket": {
      "checkedAt": "2026-09-28",
      "summarySq": "Regjistri lokal konfirmon suspensione 200/28,5 mg/5 mL dhe 400/57 mg/5 mL, si dhe flakon 1,2 g (1000/200 mg). Pikat 91,4 mg/mL nga tabela bazë nuk u konfirmuan si produkt i publikuar."
    },
    "warningsSq": [
      "Doza e kombinimit duhet lexuar sipas komponentit amoksicilinë dhe raportit amoksicilinë/klavulanat.",
      "Për IV 1000/200 mg: në insuficiencë renale (CrCl ≤30 mL/min) kërkohet skemë e përshtatur; mos përdor automatikisht skemën standarde.",
      "Kalkulatori i flakonit jep ekuivalentin e barit/flakonit, jo mL pas rikonstituimit. Vëllimi i rikonstituimit duhet marrë nga SmPC/etiketa e produktit konkret në Kosovë."
    ],
    "practicalFormulations": [
      "Syp – 228.5/5, 457/5",
      "Vial – 1.2g (1000 Amox + 200 Clav)"
    ],
    "doseReviewDate": "2026-10-27"
  },
  "Ampicillin": {
    "status": "verified-corrected",
    "badgeSq": "VERIFIKUAR · WHO",
    "summarySq": "Për infeksione bakteriale serioze te 0–59 ditë, WHO 2024: ampicilinë 50 mg/kg/dozë q12h në 7 ditët e para dhe q8h nga dita 7 deri ditën 59. Për infeksion të rëndë te 2 muaj–<5 vjeç: 50 mg/kg/dozë q6h.",
    "warningsSq": [
      "Te neonati mos përdor automatikisht formulën e thjeshtë q6h nga tabela bazë; intervali ndryshon me moshën postnatale.",
      "Meningjiti, prematuriteti dhe insuficienca renale kërkojnë protokoll specifik."
    ],
    "sources": [
      {
        "authority": "WHO 2024",
        "title": "Serious bacterial infections in infants 0–59 days · ampicillin dosing",
        "url": "https://iris.who.int/bitstream/handle/10665/379727/9789240102903-eng.pdf?sequence=1"
      },
      {
        "authority": "WHO",
        "title": "Paediatric hospital care drug dosages · ampicillin",
        "url": "https://iris.who.int/bitstream/handle/10665/42335/1/WHO_FCH_CAH_00.1.pdf"
      },
      {
        "authority": "UCSF Benioff Children’s Hospitals",
        "title": "Ampicillin IV · maximum 2000 mg per dose, children >1 month",
        "url": "https://idmp.ucsf.edu/document/pedi-dosing-card-2025"
      }
    ],
    "calculator": {
      "replace": true,
      "options": [
        {
          "label": "SBI / pneumoni · 0–59 ditë · WHO 2024",
          "mode": "clinicalRules",
          "route": "injectable",
          "rules": [
            {
              "minDays": 0,
              "maxDays": 7,
              "maxDaysInclusive": false,
              "doseType": "weight",
              "min": 50,
              "max": 50,
              "unit": "mg",
              "period": "dose",
              "frequency": "çdo 12 orë · IM/IV",
              "source": "WHO 2024 · first week of life"
            },
            {
              "minDays": 7,
              "maxDays": 60,
              "maxDaysInclusive": false,
              "doseType": "weight",
              "min": 50,
              "max": 50,
              "unit": "mg",
              "period": "dose",
              "frequency": "çdo 8 orë · IM/IV",
              "source": "WHO 2024 · after first week to day 59"
            }
          ]
        },
        {
          "label": "Infeksion i rëndë · 2 muaj–<5 vjeç · 50 mg/kg q6h · IV",
          "mode": "clinicalRules",
          "route": "injectable",
          "rules": [
            {
              "minMonths": 2,
              "maxMonths": 60,
              "maxInclusive": false,
              "doseType": "weight",
              "min": 50,
              "max": 50,
              "unit": "mg",
              "period": "dose",
              "frequency": "çdo 6 orë · IV",
              "source": "WHO paediatric hospital care",
              "maxPerDose": 2000,
              "noteSq": "Skema IV ka maksimum 2 g/dozë (UCSF 2025). Intervalet neonatale mbeten sipas WHO."
            }
          ]
        }
      ]
    },
    "practicalFormulations": [
      "Vial – 500mg",
      "Vial – 1g"
    ],
    "kosovoMarket": {
      "checkedAt": "2026-09-28",
      "summarySq": "Regjistri lokal ka 12 produkte ampicillin, përfshirë flakonë 500 mg dhe 1 g si dhe suspension oral 250 mg/5 mL."
    },
    "doseReviewDate": "2026-10-27"
  },
  "Azithromycin": {
    "status": "verified-corrected",
    "badgeSq": "VERIFIKUAR · DailyMed 2026",
    "summarySq": "Skema ndryshon sipas indikacionit. Për CAP pediatrik ≥6 muaj: 10 mg/kg ditën 1, pastaj 5 mg/kg/ditë ditët 2–5; për sinusit: 10 mg/kg/ditë për 3 ditë.",
    "warningsSq": [
      "Për pneumoni orale përdoret vetëm kur pacienti është i përshtatshëm për terapi orale; sëmundja mesatare–e rëndë ose nevoja për hospitalizim kërkon vlerësim tjetër.",
      "Mendo për QT të zgjatur/proaritmi dhe ndërveprime që zgjasin QT."
    ],
    "sources": [
      {
        "authority": "DailyMed/FDA label",
        "title": "Azithromycin oral suspension · pediatric indications and dosing",
        "url": "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=9e4fbd52-43e4-4d87-a136-f4d680a8d0c1"
      }
    ],
    "calculator": {
      "replace": true,
      "options": [
        {
          "label": "CAP · ≥6 muaj · dita 1 · 10 mg/kg",
          "mode": "clinicalRules",
          "route": "oral",
          "rules": [
            {
              "minMonths": 6,
              "doseType": "weight",
              "min": 10,
              "max": 10,
              "unit": "mg",
              "period": "dose",
              "frequency": "1 herë/ditë · dita 1",
              "source": "DailyMed · CAP day 1",
              "noteSq": "Pastaj 5 mg/kg 1 herë/ditë në ditët 2–5.",
              "maxPerDose": 500
            }
          ]
        },
        {
          "label": "CAP · ≥6 muaj · ditët 2–5 · 5 mg/kg/ditë",
          "mode": "clinicalRules",
          "route": "oral",
          "rules": [
            {
              "minMonths": 6,
              "doseType": "weight",
              "min": 5,
              "max": 5,
              "unit": "mg",
              "period": "dose",
              "frequency": "1 herë/ditë · ditët 2–5",
              "source": "DailyMed · CAP days 2–5",
              "maxPerDose": 250
            }
          ]
        },
        {
          "label": "Sinusit bakterial akut · ≥6 muaj · 10 mg/kg/ditë · 3 ditë",
          "mode": "clinicalRules",
          "route": "oral",
          "rules": [
            {
              "minMonths": 6,
              "doseType": "weight",
              "min": 10,
              "max": 10,
              "unit": "mg",
              "period": "dose",
              "frequency": "1 herë/ditë · 3 ditë",
              "source": "DailyMed · acute bacterial sinusitis",
              "maxPerDose": 500
            }
          ]
        },
        {
          "label": "Faringit/tonsilit · ≥2 vjeç · 12 mg/kg/ditë · 5 ditë",
          "mode": "clinicalRules",
          "route": "oral",
          "rules": [
            {
              "minMonths": 24,
              "doseType": "weight",
              "min": 12,
              "max": 12,
              "unit": "mg",
              "period": "dose",
              "frequency": "1 herë/ditë · 5 ditë",
              "source": "DailyMed · pharyngitis/tonsillitis",
              "maxPerDose": 500
            }
          ]
        }
      ]
    },
    "practicalFormulations": [
      "Syp – 100/5",
      "Syp – 200/5"
    ],
    "kosovoMarket": {
      "checkedAt": "2026-09-28",
      "summarySq": "Regjistri lokal ka 30 produkte azitromicinë, përfshirë suspensione 100 mg/5 mL dhe 200 mg/5 mL, tableta/kapsula 250/500 mg dhe formulim IV."
    },
    "doseReviewDate": "2026-10-27"
  }
}$antibiotic_drug_patch$::jsonb;
begin
  select payload into strict current_payload from public.pediatric_clinical_audits_v1
    where dataset_key = 'pediatric_clinical_audit_20260928' for update;
  if not exists (select 1 from jsonb_each(drug_patch) p where current_payload->'drugs'->p.key is distinct from p.value) then return; end if;
  if md5(current_payload::text) <> '24d76f45f199b90cbb6cdd17a7706f6f' then
    raise exception 'Clinical source changed: re-audit before applying the antibiotic patch';
  end if;
  update public.pediatric_clinical_audits_v1
    set payload=jsonb_set(current_payload,'{drugs}',(current_payload->'drugs')||drug_patch),updated_at=clock_timestamp()
    where dataset_key='pediatric_clinical_audit_20260928';
end
$migration$;
