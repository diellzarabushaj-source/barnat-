insert into public.pediatric_clinical_audits_v1 (
  dataset_key, version, source_kind, audit_date, payload, updated_at
)
values (
  'pediatric_clinical_audit_20260928',
  'v1-wave5',
  'authoritative_online_audit',
  date '2026-09-28',
  $clinical_audit_wave5${
  "schemaVersion": "pediatric-clinical-audit-v1",
  "auditedAt": "2026-09-28",
  "principle": "Tabela origjinale ruhet e pandryshuar; kalkulatori mund të përdorë vetëm override të verifikuar kur ky skedar e specifikon.",
  "defaultStatus": "source-table",
  "drugs": {
    "Amoxicillin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · MSF",
      "summarySq": "Doza duhet të lidhet me indikacionin; skema e tabelës bazë 15 mg/kg çdo 8 orë nuk përdoret si default universal.",
      "sources": [
        {
          "authority": "MSF",
          "title": "Amoxicillin oral",
          "url": "https://medicalguidelines.msf.org/en/viewport/EssDr/english/amoxicillin-oral-16685094.html"
        },
        {
          "authority": "MSF",
          "title": "Pneumonia in children",
          "url": "https://medicalguidelines.msf.org/en/viewport/CG/english/pneumonia-in-children-under-5-years-of-age-16689531.html"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Dozë standarde · 25 mg/kg/dozë · 2 herë/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "doseType": "weight",
                "min": 25,
                "max": 25,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë",
                "maxPerDose": 1000,
                "source": "MSF · amoxicillin oral"
              }
            ]
          },
          {
            "label": "Pneumoni / dozë e lartë · 30 mg/kg/dozë · 3 herë/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "doseType": "weight",
                "min": 30,
                "max": 30,
                "unit": "mg",
                "period": "dose",
                "frequency": "3 herë/ditë",
                "maxPerDose": 1000,
                "source": "MSF · high-dose amoxicillin",
                "noteSq": "Pneumoni pa shenja rëndese: zakonisht 5 ditë, me rivlerësim klinik."
              }
            ]
          }
        ]
      },
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri i Kosovës përmban amoksicilinë orale 125 mg/5 mL, 250 mg/5 mL dhe forma solide; verifiko produktin konkret para përshkrimit."
      }
    },
    "Amoxicillin + Clavulanic": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · MSF",
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
                "maxInclusive": false,
                "doseType": "weight",
                "min": 25,
                "max": 25,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë",
                "source": "MSF · dose expressed as amoxicillin"
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
                "maxInclusive": false,
                "doseType": "weight",
                "min": 50,
                "max": 50,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë",
                "source": "MSF · dose expressed as amoxicillin"
              }
            ]
          }
        ]
      },
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka suspensione 400/57 mg për 5 mL dhe formulime të tjera 7:1/8:1, si dhe flakon 1,2 g (1000/200 mg). Zgjidh raportin e saktë të produktit."
      }
    },
    "Cephalexin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · MSF",
      "summarySq": "Për infeksione të lëkurës doza ndryshon te neonati dhe fëmija më i madh.",
      "sources": [
        {
          "authority": "MSF",
          "title": "Cefalexin oral",
          "url": "https://medicalguidelines.msf.org/en/viewport/EssDr/english/cefalexin-oral-16683247.html"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Infeksione të lëkurës · sipas moshës",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 0.23,
                "doseType": "weight",
                "min": 25,
                "max": 25,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë",
                "source": "MSF · neonat <7 ditë"
              },
              {
                "minMonths": 0.23,
                "maxMonths": 1,
                "doseType": "weight",
                "min": 25,
                "max": 25,
                "unit": "mg",
                "period": "dose",
                "frequency": "3 herë/ditë",
                "source": "MSF · neonat 7–28 ditë"
              },
              {
                "minMonths": 1,
                "maxMonths": 144,
                "doseType": "weight",
                "min": 12.5,
                "max": 25,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë",
                "source": "MSF · 1 muaj–<12 vjeç"
              },
              {
                "minMonths": 144,
                "doseType": "fixed",
                "min": 1000,
                "max": 1000,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë",
                "source": "MSF · ≥12 vjeç"
              }
            ]
          }
        ]
      },
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Në regjistrin lokal u gjetën 6 produkte cefaleksine/cephalexin, përfshirë suspension 250 mg/5 mL dhe forma solide."
      },
      "practicalFormulations": [
        "Syp – 250/5"
      ]
    },
    "Ceftriaxone": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed 2026",
      "summarySq": "50 mg/kg dy herë në ditë nuk është default universal. Regjimi varet nga indikacioni dhe ka kufij maksimalë ditorë.",
      "warningsSq": [
        "Në këtë kalkulator doza automatike bllokohet nën 1 muaj; përdorimi neonatal kërkon vlerësim të prematuritetit, bilirubinës dhe ekspozimit ndaj kalciumit IV.",
        "Mos përdor te neonati hiperbilirubinemik/prematur sipas etiketës së referuar.",
        "Kundërindikohet te neonati ≤28 ditë që kërkon ose pritet të kërkojë solucione IV me kalcium."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Ceftriaxone sodium for injection · pediatric dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=36c07ebf-b091-483e-b2c4-f0fc0c2b4186"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Infeksion serioz jo-meningjit · 50–75 mg/kg/ditë, ndarë çdo 12 orë",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "doseType": "weight",
                "min": 25,
                "max": 37.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë",
                "maxPerDay": 2000,
                "source": "DailyMed · serious miscellaneous infections",
                "maxPerDose": 1000,
                "minMonths": 1
              }
            ]
          },
          {
            "label": "Meningjit · 100 mg/kg/ditë, ndarë çdo 12 orë",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "doseType": "weight",
                "min": 50,
                "max": 50,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë",
                "maxPerDay": 4000,
                "source": "DailyMed · meningitis",
                "maxPerDose": 2000,
                "minMonths": 1
              }
            ]
          },
          {
            "label": "Otit akut bakterial · 50 mg/kg IM · dozë e vetme",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "doseType": "weight",
                "min": 50,
                "max": 50,
                "unit": "mg",
                "period": "dose",
                "frequency": "dozë e vetme IM",
                "maxPerDose": 1000,
                "source": "DailyMed · acute bacterial otitis media",
                "minMonths": 1
              }
            ]
          }
        ]
      },
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka shumë formulime ceftriaksoni 0,5 g, 1 g dhe 2 g për injeksion/infuzion. Rikonstituimi është produkt- dhe rrugë-specifik."
      }
    },
    "Oseltamivir": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · CDC 2025–26",
      "summarySq": "Trajtimi i gripit është 5 ditë. <1 vjeç: 3 mg/kg/dozë dy herë në ditë; ≥1 vjeç: brez peshe.",
      "warningsSq": [
        "AAP rekomandon 3,5 mg/kg/dozë dy herë në ditë për moshën 9–11 muaj; CDC/FDA përdor 3 mg/kg/dozë.",
        "Te prematurët përdoret dozimi sipas moshës postmenstruale; mos përdor automatikisht skemën e foshnjës term."
      ],
      "sources": [
        {
          "authority": "CDC",
          "title": "Influenza Antiviral Medications: Summary for Clinicians · 2025–2026",
          "url": "https://www.cdc.gov/flu/hcp/antivirals/summary-clinicians.html"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Trajtimi i gripit · 5 ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "maxMonths": 12,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 3,
                "max": 3,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë · 5 ditë",
                "source": "CDC 2025–26 · <1 vjeç"
              },
              {
                "minMonths": 12,
                "minKg": 0,
                "maxKg": 15,
                "maxKgInclusive": true,
                "doseType": "fixed",
                "min": 30,
                "max": 30,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë · 5 ditë",
                "source": "CDC 2025–26 · ≥1 vjeç, ≤15 kg"
              },
              {
                "minMonths": 12,
                "minKg": 15,
                "minKgInclusive": false,
                "maxKg": 23,
                "maxKgInclusive": true,
                "doseType": "fixed",
                "min": 45,
                "max": 45,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë · 5 ditë",
                "source": "CDC 2025–26 · >15–23 kg"
              },
              {
                "minMonths": 12,
                "minKg": 23,
                "minKgInclusive": false,
                "maxKg": 40,
                "maxKgInclusive": true,
                "doseType": "fixed",
                "min": 60,
                "max": 60,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë · 5 ditë",
                "source": "CDC 2025–26 · >23–40 kg"
              },
              {
                "minMonths": 12,
                "minKg": 40,
                "minKgInclusive": false,
                "doseType": "fixed",
                "min": 75,
                "max": 75,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë · 5 ditë",
                "source": "CDC 2025–26 · >40 kg"
              }
            ]
          }
        ]
      },
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Në kërkimin aktual të regjistrit lokal nuk u gjet produkt i publikuar me substancë 'oseltamivir'; verifiko furnizimin aktual para recetës."
      },
      "practicalFormulations": []
    },
    "Linezolid": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Për infeksionet serioze të listuara: lindje–11 vjeç 10 mg/kg çdo 8 orë; ≥12 vjeç 600 mg çdo 12 orë.",
      "warningsSq": [
        "Në 7 ditët e para të jetës kalkulatori nuk jep AUTO pa kontekst neonatal, sepse prematuriteti mund ta ndryshojë intervalin në çdo 12 orë.",
        "Prematur <7 ditë dhe GA <34 javë: etiketa rekomandon nisje 10 mg/kg çdo 12 orë; regjimi neonatal kërkon moshë gestacionale.",
        "Dozimi ndryshon sipas indikacionit; infeksionet e pakomplikuara të lëkurës kanë skemë tjetër."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "ZYVOX (linezolid) · pediatric dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=50630775-7f76-413e-9278-ba298dd7f187"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Infeksione serioze të listuara · sipas moshës",
            "mode": "clinicalRules",
            "route": "oral_or_injectable",
            "rules": [
              {
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 10,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë",
                "maxPerDose": 600,
                "source": "DailyMed · birth through 11 years",
                "minMonths": 0.23
              },
              {
                "minMonths": 144,
                "doseType": "fixed",
                "min": 600,
                "max": 600,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë",
                "source": "DailyMed · ≥12 years"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Infusion – 2mg/1ml"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka linezolid 2 mg/mL si solucion për infuzion (p.sh. 600 mg/300 mL)."
      }
    },
    "Pantoprazole": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Skema 0,2 mg/kg/orë nuk përdoret për GERD/EE pediatrik. Etiketa aktuale IV përdor dozë 1 herë/ditë sipas moshës dhe peshës.",
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "PROTONIX I.V. · pediatric GERD/history of erosive esophagitis",
          "url": "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f39b3e7d-39d2-4c8a-9974-4ab885241880"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "GERD / histori e ezofagitit eroziv · IV · deri 7 ditë",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 3,
                "maxMonths": 12,
                "maxInclusive": false,
                "maxKg": 12.5,
                "maxKgInclusive": false,
                "doseType": "weight",
                "min": 0.8,
                "max": 0.8,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · infuzion 15 min",
                "source": "DailyMed · 3m–<1y, <12.5kg"
              },
              {
                "minMonths": 3,
                "maxMonths": 12,
                "maxInclusive": false,
                "minKg": 12.5,
                "doseType": "fixed",
                "min": 10,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · infuzion 15 min",
                "source": "DailyMed · 3m–<1y, ≥12.5kg"
              },
              {
                "minMonths": 12,
                "maxMonths": 216,
                "maxInclusive": false,
                "maxKg": 15,
                "maxKgInclusive": true,
                "doseType": "fixed",
                "min": 10,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · infuzion 15 min",
                "source": "DailyMed · 1–17y, ≤15kg"
              },
              {
                "minMonths": 12,
                "maxMonths": 216,
                "maxInclusive": false,
                "minKg": 15,
                "minKgInclusive": false,
                "maxKg": 40,
                "maxKgInclusive": true,
                "doseType": "fixed",
                "min": 20,
                "max": 20,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · infuzion 15 min",
                "source": "DailyMed · 1–17y, >15–40kg"
              },
              {
                "minMonths": 12,
                "maxMonths": 216,
                "maxInclusive": false,
                "minKg": 40,
                "minKgInclusive": false,
                "doseType": "fixed",
                "min": 40,
                "max": 40,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · infuzion 15 min",
                "source": "DailyMed · 1–17y, >40kg"
              }
            ]
          }
        ]
      },
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka pantoprazol 20/40 mg oral dhe disa formulime 40 mg për injeksion; rikonstituimi duhet marrë nga produkti konkret."
      }
    },
    "Domperidone": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · EMA",
      "summarySq": "Kur një produkt pediatrik i përshtatshëm është i licencuar: 0,25 mg/kg/dozë deri 3 herë/ditë; zakonisht jo më gjatë se 1 javë.",
      "warningsSq": [
        "Rrezik QT/aritmie: kundërindikohet me çrregullime të përcjelljes kardiake, sëmundje të rëndësishme kardiake, barna që zgjasin QT ose inhibitorë potentë CYP3A4.",
        "Për <35 kg duhen formulime orale që lejojnë dozë precize; tabletat 10 mg nuk janë formë e përshtatshme për matje pediatrike sipas rekomandimit EMA."
      ],
      "sources": [
        {
          "authority": "EMA",
          "title": "Domperidone-containing medicines referral",
          "url": "https://www.ema.europa.eu/en/medicines/human/referrals/domperidone-containing-medicines"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Nauze/të vjella · <35 kg · 0,25 mg/kg/dozë · deri 3 herë/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "maxKg": 35,
                "maxKgInclusive": false,
                "doseType": "weight",
                "min": 0.25,
                "max": 0.25,
                "unit": "mg",
                "period": "dose",
                "frequency": "deri 3 herë/ditë · zakonisht ≤1 javë",
                "maxDailyPerKg": 0.75,
                "source": "EMA · pediatric oral dose"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Në regjistrin lokal të kontrolluar u gjetën vetëm tableta domperidone 10 mg; nuk u konfirmua suspension/pika pediatrike."
      }
    },
    "Montelukast": {
      "status": "verified-warning",
      "badgeSq": "VERIFIKUAR · FDA/DailyMed",
      "summarySq": "Dozat 4/5/10 mg sipas moshës përputhen me etiketën; nuk është bar për sulm akut të astmës.",
      "warningsSq": [
        "FDA ka Boxed Warning për ngjarje serioze neuropsikiatrike.",
        "Për rinit alergjik duhet rezervuar kur alternativat nuk funksionojnë ose nuk tolerohen."
      ],
      "sources": [
        {
          "authority": "DailyMed",
          "title": "Montelukast sodium · pediatric dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=64a3b181-e8d8-4caf-9f1b-e0063d0bd94a"
        },
        {
          "authority": "FDA",
          "title": "Boxed Warning for serious mental health side effects",
          "url": "https://www.fda.gov/drugs/drug-safety-communications/fda-requires-boxed-warning-about-serious-mental-health-side-effects-asthma-and-allergy-drug"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Astma · 1 herë në mbrëmje · sipas moshës",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 12,
                "maxMonths": 24,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 4,
                "max": 4,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë në mbrëmje",
                "source": "DailyMed · asthma 12–23m oral granules"
              },
              {
                "minMonths": 24,
                "maxMonths": 72,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 4,
                "max": 4,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë në mbrëmje",
                "source": "DailyMed · asthma 2–5y"
              },
              {
                "minMonths": 72,
                "maxMonths": 180,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 5,
                "max": 5,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë në mbrëmje",
                "source": "DailyMed · asthma 6–14y"
              },
              {
                "minMonths": 180,
                "doseType": "fixed",
                "min": 10,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë në mbrëmje",
                "source": "DailyMed · ≥15y"
              }
            ]
          }
        ]
      },
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka montelukast 4 mg, 5 mg dhe 10 mg, përfshirë tableta përtypëse dhe granula."
      },
      "practicalFormulations": []
    },
    "Paracetamol": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · MSF",
      "summarySq": "Neonati kërkon dozë më të ulët se fëmija ≥1 muaj dhe duhet respektuar maksimumi ditor.",
      "sources": [
        {
          "authority": "MSF",
          "title": "Paracetamol oral",
          "url": "https://medicalguidelines.msf.org/en/viewport/EssDr/english/paracetamol-acetaminophen-oral-16683025.html"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Dhimbje / temperaturë · oral · sipas moshës",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 1,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 10,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "3–4 herë/ditë",
                "maxDailyPerKg": 40,
                "source": "MSF · <1 muaj"
              },
              {
                "minMonths": 1,
                "doseType": "weight",
                "min": 15,
                "max": 15,
                "unit": "mg",
                "period": "dose",
                "frequency": "3–4 herë/ditë",
                "maxDailyPerKg": 60,
                "maxPerDose": 1000,
                "source": "MSF · ≥1 muaj"
              }
            ]
          }
        ]
      },
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal përmban shumë forma pediatrike orale, përfshirë 120 mg/5 mL dhe 250 mg/5 mL; zgjidh vetëm produktin mono-substancë."
      },
      "practicalFormulations": [
        "Syp – 120/5, 250/5"
      ]
    },
    "Ibuprofen": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · MSF",
      "summarySq": ">3 muaj: 5–10 mg/kg/dozë 3–4 herë/ditë; maksimum 30 mg/kg/ditë.",
      "warningsSq": [
        "Mos përdor te dehidratimi i rëndë, insuficienca renale, gjakderdhja gastrointestinale ose ethet hemorragjike/dengue.",
        "Te foshnjat shumë të vogla duhet respektuar kufiri i moshës dhe konteksti klinik."
      ],
      "sources": [
        {
          "authority": "MSF",
          "title": "Ibuprofen oral",
          "url": "https://medicalguidelines.msf.org/en/viewport/EssDr/english/ibuprofen-oral-16683877.html"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Dhimbje / temperaturë · >3 muaj · 5–10 mg/kg/dozë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 3,
                "minInclusive": false,
                "doseType": "weight",
                "min": 5,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "3–4 herë/ditë",
                "maxDailyPerKg": 30,
                "source": "MSF · pain/fever"
              }
            ]
          }
        ]
      },
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka suspension oral 100 mg/5 mL dhe forma të tjera; për pediatri prefero formulimin e përshtatshëm për dozimin sipas peshës."
      }
    },
    "Piperacillin + Tazobactam": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · SmPC",
      "summarySq": "Doza pediatrike duhet të shprehet sipas komponentëve. Për 2–11 vjeç: cIAI 100 mg piperacilinë + 12,5 mg tazobaktam/kg çdo 8 orë; neutropeni febrile 80/10 mg/kg çdo 6 orë.",
      "warningsSq": [
        "AUTO bllokohet nën 2 vjeç dhe nga 12 vjeç e lart në këtë skemë pediatrike; përdor dozën sipas SmPC/protokollit të grupmoshës.",
        "Në insuficiencë renale doza/intervali kërkon përshtatje."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Piperacillin/Tazobactam 4 g/0.5 g · pediatric posology",
          "url": "https://www.medicines.org.uk/emc/product/102161/smpc"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "cIAI · 2–11 vjeç · 100 mg/kg piperacilinë q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "componentBasis": "piperacillin",
            "rules": [
              {
                "minMonths": 24,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 100,
                "max": 100,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë · infuzion 30 min",
                "maxPerDose": 4000,
                "source": "SmPC · cIAI · dose expressed as piperacillin",
                "noteSq": "Tazobaktam: 12,5 mg/kg/dozë; maks. 4 g/0,5 g për dozë."
              }
            ]
          },
          {
            "label": "Neutropeni febrile · 2–11 vjeç · 80 mg/kg piperacilinë q6h",
            "mode": "clinicalRules",
            "route": "injectable",
            "componentBasis": "piperacillin",
            "rules": [
              {
                "minMonths": 24,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 80,
                "max": 80,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 6 orë · infuzion 30 min",
                "maxPerDose": 4000,
                "source": "SmPC · febrile neutropenia · dose expressed as piperacillin",
                "noteSq": "Tazobaktam: 10 mg/kg/dozë; maks. 4 g/0,5 g për dozë."
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Vial – 4g piperacillin + 0.5g tazobactam"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 10 produkte të publikuara piperacilinë/tazobaktam, përfshirë 4 g/0,5 g dhe 2 g/0,25 g për injeksion/infuzion."
      }
    },
    "Meropenem": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed 2025–26",
      "summarySq": "Nga mosha ≥3 muaj doza ndryshon sipas indikacionit: 10 mg/kg q8h për cSSSI, 20 mg/kg q8h për infeksion intraabdominal dhe 40 mg/kg q8h për meningjit.",
      "warningsSq": [
        "Nën 3 muaj dozimi varet nga mosha gestacionale dhe postnatale; ky kalkulator nuk jep AUTO neonatal.",
        "Te insuficienca renale pediatrike të dhënat e etiketës janë të kufizuara; kërkohet individualizim."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Meropenem for Injection · pediatric dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=0d37e43b-ff8d-495d-b9af-4fd5fce53d56"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "cSSSI · ≥3 muaj · 10 mg/kg q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 3,
                "doseType": "weight",
                "min": 10,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë",
                "maxPerDose": 500,
                "source": "DailyMed · complicated skin/skin structure infection"
              }
            ]
          },
          {
            "label": "cSSSI me P. aeruginosa · ≥3 muaj · 20 mg/kg q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 3,
                "doseType": "weight",
                "min": 20,
                "max": 20,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë",
                "maxPerDose": 1000,
                "source": "DailyMed · P. aeruginosa cSSSI"
              }
            ]
          },
          {
            "label": "Infeksion intraabdominal · ≥3 muaj · 20 mg/kg q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 3,
                "doseType": "weight",
                "min": 20,
                "max": 20,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë",
                "maxPerDose": 1000,
                "source": "DailyMed · complicated intra-abdominal infection"
              }
            ]
          },
          {
            "label": "Meningjit · ≥3 muaj · 40 mg/kg q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 3,
                "doseType": "weight",
                "min": 40,
                "max": 40,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë",
                "maxPerDose": 2000,
                "source": "DailyMed · meningitis"
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
        "summarySq": "Regjistri lokal ka 13 produkte meropenem, kryesisht flakonë 500 mg dhe 1 g për injeksion/infuzion."
      }
    },
    "Cotrimoxazole (TMP + SMZ)": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Doza llogaritet sipas trimetoprimit (TMP), jo sipas totalit të kombinimit. Për UTI/AOM: 8 mg TMP/kg/24 h në 2 doza; për PCP: 15–20 mg TMP/kg/24 h të ndara q6h.",
      "warningsSq": [
        "Kundërindikohet te fëmijët <2 muaj sipas etiketës së referuar.",
        "Profilaksia e PCP te fëmijët në etiketë është BSA-based (mg/m²), prandaj skema e vjetër mg/kg nuk automatizohet këtu."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Sulfamethoxazole/Trimethoprim · pediatric UTI/AOM dosing",
          "url": "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=f0e73842-6002-43c2-97fc-0cadc1bf6346"
        },
        {
          "authority": "DailyMed/FDA label",
          "title": "Sulfamethoxazole/Trimethoprim · Pneumocystis treatment/prophylaxis",
          "url": "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=a0f86f52-8841-4e1c-8536-2e78320471ed"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "UTI / AOM · ≥2 muaj · 4 mg TMP/kg/dozë q12h · 10 ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "componentBasis": "TMP",
            "rules": [
              {
                "minMonths": 2,
                "doseType": "weight",
                "min": 4,
                "max": 4,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 10 ditë",
                "source": "DailyMed · 8 mg TMP/kg/day in 2 divided doses"
              }
            ]
          },
          {
            "label": "Shigellozë · ≥2 muaj · 4 mg TMP/kg/dozë q12h · 5 ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "componentBasis": "TMP",
            "rules": [
              {
                "minMonths": 2,
                "doseType": "weight",
                "min": 4,
                "max": 4,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 5 ditë",
                "source": "DailyMed · shigellosis"
              }
            ]
          },
          {
            "label": "PCP · ≥2 muaj · 3,75–5 mg TMP/kg/dozë q6h · 14–21 ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "componentBasis": "TMP",
            "rules": [
              {
                "minMonths": 2,
                "doseType": "weight",
                "min": 3.75,
                "max": 5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 6 orë · 14–21 ditë",
                "source": "DailyMed · PCP treatment 15–20 mg TMP/kg/day"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 40/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 7 produkte TMP/SMX, përfshirë suspension 200 mg sulfametoksazol + 40 mg TMP / 5 mL dhe tableta 400/80 mg."
      }
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
                "noteSq": "Pastaj 5 mg/kg 1 herë/ditë në ditët 2–5."
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
                "source": "DailyMed · CAP days 2–5"
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
                "source": "DailyMed · acute bacterial sinusitis"
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
                "source": "DailyMed · pharyngitis/tonsillitis"
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
      }
    },
    "Cefixime": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed 2025",
      "summarySq": "≥6 muaj: 8 mg/kg/ditë, si një dozë ditore ose 4 mg/kg çdo 12 orë. Maksimumi praktik i etiketës është doza adulte 400 mg/ditë.",
      "warningsSq": [
        "Për otit media etiketa specifikon suspensionin oral; kapsula/tableta nuk duhet të zëvendësojnë automatikisht suspensionin mg-për-mg.",
        "Për Streptococcus pyogenes terapia duhet të jetë së paku 10 ditë."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Cefixime oral suspension · pediatric dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6d68dbd9-7d75-4ff1-91db-79ff8ae879ec"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "≥6 muaj · 8 mg/kg · 1 herë/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 6,
                "doseType": "weight",
                "min": 8,
                "max": 8,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë",
                "maxPerDose": 400,
                "source": "DailyMed · 8 mg/kg/day"
              }
            ]
          },
          {
            "label": "≥6 muaj · 4 mg/kg/dozë · q12h",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 6,
                "doseType": "weight",
                "min": 4,
                "max": 4,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë",
                "maxPerDose": 200,
                "source": "DailyMed · 4 mg/kg every 12 hours"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 100/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 22 produkte cefixime; u konfirmua suspension 100 mg/5 mL dhe forma solide 400 mg."
      }
    },
    "Cefuroxime": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · SmPC",
      "summarySq": "Cefuroxime axetil oral: nga 3 muaj, 10 mg/kg dy herë/ditë për shumicën e infeksioneve; 15 mg/kg dy herë/ditë për otit media ose infeksione më të rënda.",
      "warningsSq": [
        "Ky override auditoi cefuroxime axetil ORAL; forma parenterale nuk automatizohet në këtë valë.",
        "Tabletat dhe suspensioni i cefuroxime axetil nuk janë domosdoshmërisht të zëvendësueshme mg-për-mg sipas SmPC."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Zinnat suspension 125 mg · pediatric posology",
          "url": "https://www.medicines.org.uk/emc/product/3814/smpc"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Shumica e infeksioneve · ≥3 muaj · 10 mg/kg BID",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 3,
                "doseType": "weight",
                "min": 10,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë",
                "maxPerDose": 125,
                "source": "SmPC · most infections"
              }
            ]
          },
          {
            "label": "Otit media / infeksion më i rëndë · ≥3 muaj · 15 mg/kg BID",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 3,
                "doseType": "weight",
                "min": 15,
                "max": 15,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë",
                "maxPerDose": 250,
                "source": "SmPC · otitis/media severe infections"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 125/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 11 produkte cefuroxime, përfshirë suspension 125 mg/5 mL, tableta 250/500 mg dhe forma injektabile 750 mg."
      }
    },
    "Vancomycin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · SmPC",
      "summarySq": "IV: 1 muaj–<12 vjeç 10–15 mg/kg çdo 6 orë; ≥12 vjeç 15–20 mg/kg çdo 8–12 orë. Doza pasuese duhet individualizuar me nivele/TDM dhe funksion renal.",
      "warningsSq": [
        "Neonati kërkon dozë sipas moshës postmenstruale; AUTO bllokohet nën 1 muaj.",
        "Vancomycina është bar TDM: doza e mirëmbajtjes nuk duhet të mbetet vetëm te mg/kg pa monitorim të ekspozimit dhe funksionit renal."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Vancomycin infusion · pediatric IV dosing and monitoring",
          "url": "https://www.medicines.org.uk/emc/product/8760/smpc"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "IV sistemik · sipas moshës",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 10,
                "max": 15,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 6 orë · TDM",
                "source": "SmPC · 1 month to <12 years"
              },
              {
                "minMonths": 144,
                "doseType": "weight",
                "min": 15,
                "max": 20,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8–12 orë · TDM",
                "maxPerDose": 2000,
                "source": "SmPC · ≥12 years"
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
        "summarySq": "Regjistri lokal ka 6 produkte vancomycin, kryesisht flakonë 500 mg dhe 1 g për infuzion."
      }
    },
    "Acyclovir": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed 2026",
      "summarySq": "Për varicelë te fëmijët ≥2 vjeç: 20 mg/kg/dozë nga goja 4 herë/ditë për 5 ditë; mbi 40 kg përdoret doza adulte 800 mg 4 herë/ditë.",
      "warningsSq": [
        "Ky kalkulator automatizon vetëm skemën ORALE të varicelës; acyclovir IV është indikacion-, moshë- dhe funksion-renal specifik.",
        "Në insuficiencë renale intervali oral kërkon përshtatje."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Acyclovir tablets · treatment of chickenpox in children",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d8004652-86fe-4714-81d4-5e1dd2585bb4"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Varicelë · ≥2 vjeç · 20 mg/kg/dozë · 4 herë/ditë · 5 ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 24,
                "doseType": "weight",
                "min": 20,
                "max": 20,
                "unit": "mg",
                "period": "dose",
                "frequency": "4 herë/ditë · 5 ditë",
                "maxPerDose": 800,
                "source": "DailyMed · chickenpox"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Tab – 200mg, 400mg, 800mg"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 15 produkte acyclovir/aciclovir; për përdorim sistemik u konfirmuan tableta 200/400/800 mg dhe flakon IV 250 mg, por jo suspension oral i publikuar."
      }
    },
    "Cetirizine": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Doza është kryesisht age-based, jo mg/kg. 6–23 muaj: 2,5 mg 1 herë/ditë; 2–5 vjeç: 2,5 mg/ditë, maksimum 5 mg/ditë; ≥6 vjeç: 5–10 mg 1 herë/ditë.",
      "warningsSq": [
        "Te 12–23 muaj, kur kërkohet, doza mund të rritet në 2,5 mg çdo 12 orë; mos e apliko automatikisht si default.",
        "Sëmundja renale/hepatike mund të kërkojë dozë tjetër."
      ],
      "sources": [
        {
          "authority": "DailyMed",
          "title": "Cetirizine oral solution · 6 to 23 months and 2 to 5 years",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=efabbad5-a162-45c8-a896-5af58e5d2d39"
        },
        {
          "authority": "DailyMed OTC label",
          "title": "Children’s cetirizine 1 mg/mL · age 6 years and older",
          "url": "https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=db297aa4-4384-48f2-b2bd-c842efc8a844"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "6–23 muaj · 2,5 mg · 1 herë/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 6,
                "maxMonths": 24,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 2.5,
                "max": 2.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë",
                "source": "DailyMed · 6–23 months"
              }
            ]
          },
          {
            "label": "12–23 muaj · kur duhet rritje · 2,5 mg q12h",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 12,
                "maxMonths": 24,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 2.5,
                "max": 2.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · maks. 5 mg/ditë",
                "source": "DailyMed · 12–23 months maximum regimen"
              }
            ]
          },
          {
            "label": "2–5 vjeç · 2,5 mg · 1 herë/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 24,
                "maxMonths": 72,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 2.5,
                "max": 2.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë",
                "source": "DailyMed · 2–5 years"
              }
            ]
          },
          {
            "label": "2–5 vjeç · maksimum · 5 mg/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 24,
                "maxMonths": 72,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 5,
                "max": 5,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë OSE 2,5 mg q12h",
                "source": "DailyMed · 2–5 years maximum"
              }
            ]
          },
          {
            "label": "≥6 vjeç · 5–10 mg · 1 herë/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 72,
                "doseType": "fixed",
                "min": 5,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · maks. 10 mg/24 h",
                "source": "DailyMed OTC · ≥6 years"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 5/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 13 produkte cetirizine, përfshirë solucion/shurup 1 mg/mL, pika dhe tableta 10 mg."
      }
    },
    "Clarithromycin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed 2026",
      "summarySq": "≥6 muaj: 7,5 mg/kg/dozë çdo 12 orë (15 mg/kg/ditë), zakonisht për 10 ditë për indikacionet pediatrike të etiketës; maksimumi 500 mg për dozë.",
      "warningsSq": [
        "Mos përdor si antibiotik empirik pa indikacion bakterial të arsyeshëm; rezistenca ndaj makrolideve ndryshon sipas patogjenit.",
        "Kujdes me QT të zgjatur dhe ndërveprimet CYP3A4; insuficienca renale mund të kërkojë reduktim doze."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Clarithromycin for oral suspension · pediatric dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=fad1e5a3-59f9-4868-9937-d3b061ab8f00"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Infeksione pediatrike të etiketës · ≥6 muaj · 7,5 mg/kg q12h · 10 ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 6,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 7.5,
                "max": 7.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 10 ditë",
                "maxPerDose": 500,
                "source": "DailyMed · 15 mg/kg/day divided q12h"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 250/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 12 produkte klaritromicinë; u konfirmua suspension 250 mg/5 mL dhe forma solide 250/500 mg."
      }
    },
    "Cefpodoxime": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed 2025",
      "summarySq": "2 muaj–<12 vjeç: 5 mg/kg/dozë çdo 12 orë. Maksimumi dhe kohëzgjatja varen nga indikacioni; nga 12 vjeç përdoren doza fikse të etiketës.",
      "warningsSq": [
        "Në insuficiencë renale të rëndë (CrCl <30 mL/min) intervali zgjatet në çdo 24 orë sipas etiketës.",
        "Kalkulatori i ndan qartë otitin, faringitin/tonsilitin dhe sinusitin sepse kufijtë maksimalë nuk janë të njëjtë."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Cefpodoxime proxetil oral suspension · pediatric dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=edf589b2-f796-4522-a5e6-2bd0a833922f"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Otit media akut · 2 muaj–<12 vjeç · 5 mg/kg q12h · 5 ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 2,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 5,
                "max": 5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 5 ditë",
                "maxPerDose": 200,
                "maxPerDay": 400,
                "source": "DailyMed · acute otitis media"
              }
            ]
          },
          {
            "label": "Faringit / tonsilit",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 2,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 5,
                "max": 5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 5–10 ditë",
                "maxPerDose": 100,
                "maxPerDay": 200,
                "source": "DailyMed · pediatric pharyngitis/tonsillitis"
              },
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 100,
                "max": 100,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 5–10 ditë",
                "source": "DailyMed · adolescent/adult pharyngitis/tonsillitis"
              }
            ]
          },
          {
            "label": "Sinusit maksilar akut",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 2,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 5,
                "max": 5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 10 ditë",
                "maxPerDose": 200,
                "maxPerDay": 400,
                "source": "DailyMed · pediatric acute maxillary sinusitis"
              },
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 200,
                "max": 200,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 10 ditë",
                "source": "DailyMed · adolescent/adult acute maxillary sinusitis"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 40/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 6 produkte cefpodoxime, përfshirë suspension 40 mg/5 mL dhe tableta 100/200 mg."
      }
    },
    "Ceftazidime": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "IV: neonat 0–4 javë 30 mg/kg çdo 12 orë; 1 muaj–<12 vjeç zakonisht 30 mg/kg çdo 8 orë, ndërsa 50 mg/kg çdo 8 orë rezervohet për pacientë imunokomprometuar, fibrozë cistike ose meningjit.",
      "warningsSq": [
        "Doza duhet përshtatur në insuficiencë renale.",
        "AUTO për 50 mg/kg q8h shfaqet si skemë e veçantë për indikacionet ku etiketa rezervon dozën e lartë."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Ceftazidime injection · pediatric dosage schedule",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=bcc81df2-20e3-4738-bfcf-301da883c1d9"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Neonat 0–4 javë · 30 mg/kg IV q12h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 1,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 30,
                "max": 30,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · IV",
                "source": "DailyMed · neonates 0–4 weeks"
              }
            ]
          },
          {
            "label": "1 muaj–<12 vjeç · zakonisht 30 mg/kg IV q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 30,
                "max": 30,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë · IV",
                "maxPerDose": 2000,
                "maxPerDay": 6000,
                "source": "DailyMed · infants and children"
              }
            ]
          },
          {
            "label": "Imunokomprometuar / fibrozë cistike / meningjit · 50 mg/kg IV q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 50,
                "max": 50,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë · IV",
                "maxPerDose": 2000,
                "maxPerDay": 6000,
                "source": "DailyMed · higher pediatric dose reserved for severe indications"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Vial – 1g"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal konfirmon ceftazidime të vetme si flakon 1 g; produktet ceftazidime/avibactam nuk përdoren për konvertimin e ceftazidime monoterapi."
      }
    },
    "Albendazole": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · WHO",
      "summarySq": "Për deworming preventiv kundër helminteve të transmetuara nga toka: 12–23 muaj 200 mg dozë e vetme; nga 2 vjeç 400 mg dozë e vetme në popullatat/zonat ku rekomandohet programi WHO.",
      "warningsSq": [
        "Kjo skemë është për preventive chemotherapy/deworming të WHO, jo një dozë universale për çdo helmintozë.",
        "Diagnoza specifike si strongyloidiasis, neurocysticercosis ose hydatid disease kërkon regjim tjetër."
      ],
      "sources": [
        {
          "authority": "WHO",
          "title": "Deworming in children · WHO recommendation",
          "url": "https://www.who.int/tools/elena/interventions/deworming"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "WHO deworming · 12–23 muaj · 200 mg dozë e vetme",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 12,
                "maxMonths": 24,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 200,
                "max": 200,
                "unit": "mg",
                "period": "dose",
                "frequency": "dozë e vetme",
                "source": "WHO · half-dose albendazole below 24 months"
              }
            ]
          },
          {
            "label": "WHO deworming · 2–<15 vjeç · 400 mg dozë e vetme",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 24,
                "maxMonths": 180,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 400,
                "max": 400,
                "unit": "mg",
                "period": "dose",
                "frequency": "dozë e vetme",
                "source": "WHO · preventive chemotherapy"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 400/10",
        "Tab – 400mg"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 4 produkte albendazole, përfshirë suspension 400 mg/10 mL dhe tableta 200/400 mg."
      }
    },
    "Ivermectin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed 2026",
      "summarySq": "Strongyloidiasis: rreth 200 mcg/kg (=0,2 mg/kg) nga goja si dozë e vetme. Etiketa nuk e ka të vendosur sigurinë/efikasitetin nën 15 kg.",
      "warningsSq": [
        "AUTO bllokohet nën 15 kg.",
        "Onchocerciasis përdor 150 mcg/kg, jo të njëjtën skemë; indikacionet e tjera kërkojnë protokoll specifik.",
        "Nuk u gjet produkt ivermectin i publikuar në regjistrin lokal në kontrollin e 28.09.2026."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Ivermectin tablets · strongyloidiasis dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2de5ee45-0465-4996-ac00-5bdd352b4ed7"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Strongyloidiasis · ≥15 kg · 0,2 mg/kg dozë e vetme",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minKg": 15,
                "doseType": "weight",
                "min": 0.2,
                "max": 0.2,
                "unit": "mg",
                "period": "dose",
                "frequency": "dozë e vetme · esëll me ujë",
                "source": "DailyMed · 200 mcg/kg single oral dose"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "0 produkte ivermectin të publikuara u gjetën në regjistrin lokal në kontrollin aktual."
      }
    },
    "Levocetirizine": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Dozimi është age-based. 6 muaj–5 vjeç: 1,25 mg në mbrëmje; 6–11 vjeç: 2,5 mg në mbrëmje; ≥12 vjeç: 5 mg në mbrëmje. Për rinit perennial, etiketa mbulon 6 muaj–2 vjeç.",
      "warningsSq": [
        "Te fëmijët 6 muaj–11 vjeç me insuficiencë renale, etiketa e referuar e kundërindikon përdorimin.",
        "Për moshat e vogla forma e preferuar është solucion oral; regjistri lokal aktual ka vetëm tableta 5 mg të publikuara."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Levocetirizine oral solution · pediatric dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=2965ef46-18db-4615-9dce-bfb0f0b3366a"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Urtikarie idiopatike kronike · sipas moshës",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 6,
                "maxMonths": 72,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 1.25,
                "max": 1.25,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë në mbrëmje",
                "source": "DailyMed · 6 months–5 years"
              },
              {
                "minMonths": 72,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 2.5,
                "max": 2.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë në mbrëmje",
                "source": "DailyMed · 6–11 years"
              },
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 5,
                "max": 5,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë në mbrëmje",
                "source": "DailyMed · ≥12 years"
              }
            ]
          },
          {
            "label": "Rinit alergjik perennial · 6 muaj–<2 vjeç",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 6,
                "maxMonths": 24,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 1.25,
                "max": 1.25,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë në mbrëmje",
                "source": "DailyMed · perennial allergic rhinitis"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Tab – 5mg"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 5 produkte levocetirizine, aktualisht forma solide 5 mg; nuk u konfirmua solucion pediatrik i publikuar."
      }
    },
    "Hydroxyzine": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · SmPC/EMA",
      "summarySq": "Për pruritus: përdor dozën më të ulët efektive dhe sa më shkurt. 6 muaj–6 vjeç 5–15 mg/ditë në doza të ndara; >6 vjeç fillohet 15–25 mg/ditë dhe titrohet sipas përgjigjes. Maksimumi te ≤40 kg është 2 mg/kg/ditë; >40 kg maksimumi 100 mg/ditë.",
      "warningsSq": [
        "Hydroxyzina mund të zgjasë QT; shmanget te QT i zgjatur dhe faktorët e njohur të rrezikut për torsades de pointes.",
        "Skema 0,5 mg/kg q6h nga tabela bazë arrin 2 mg/kg/ditë, pra kufirin maksimal — nuk përdoret si default i automatizuar."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Hydroxyzine tablets · pediatric pruritus posology",
          "url": "https://www.medicines.org.uk/emc/product/101785/smpc"
        },
        {
          "authority": "EMA",
          "title": "Hydroxyzine referral · QT-risk restrictions",
          "url": "https://www.ema.europa.eu/en/medicines/human/referrals/hydroxyzine"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Pruritus · 6 muaj–<6 vjeç · 5–15 mg/ditë në doza të ndara",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 6,
                "maxMonths": 72,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 5,
                "max": 15,
                "unit": "mg",
                "period": "day",
                "frequency": "në doza të ndara",
                "maxDailyPerKg": 2,
                "maxPerDay": 100,
                "source": "SmPC · 6 months to 6 years",
                "noteSq": "Përdor dozën më të ulët efektive."
              }
            ]
          },
          {
            "label": "Pruritus · 6–<18 vjeç · fillimi 15–25 mg/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 72,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 15,
                "max": 25,
                "unit": "mg",
                "period": "day",
                "frequency": "në doza të ndara",
                "maxDailyPerKg": 2,
                "maxPerDay": 100,
                "source": "SmPC · children over 6 years starting dose",
                "noteSq": "Titrimi më lart kërkon vlerësim klinik; AUTO jep vetëm dozën fillestare."
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Tab – 25mg"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 1 produkt hydroxyzine të publikuar: tabletë 25 mg; nuk u konfirmua shurup/pika pediatrike."
      }
    },
    "Lansoprazole": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed 2026",
      "summarySq": "GERD/ezofagit eroziv: 1–11 vjeç ≤30 kg 15 mg 1 herë/ditë; >30 kg 30 mg 1 herë/ditë, deri 12 javë. 12–17 vjeç: GERD jo-eroziv 15 mg/ditë, ezofagit eroziv 30 mg/ditë, deri 8 javë.",
      "warningsSq": [
        "Efikasiteti për GERD simptomatik te foshnjat <1 vjeç nuk u demonstrua në studimet e etiketës; AUTO bllokohet nën 1 vjeç.",
        "Mos e zgjat terapinë pediatrike përtej kohëzgjatjes së etiketës pa indikacion të qartë dhe rivlerësim."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Lansoprazole delayed release · pediatric dosage by indication",
          "url": "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7daa1721-f92b-4096-b19e-4d27fc8acb51"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "GERD / ezofagit eroziv · 1–11 vjeç · sipas peshës",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 12,
                "maxMonths": 144,
                "maxInclusive": false,
                "maxKg": 30,
                "doseType": "fixed",
                "min": 15,
                "max": 15,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · deri 12 javë",
                "source": "DailyMed · 1–11 years ≤30 kg"
              },
              {
                "minMonths": 12,
                "maxMonths": 144,
                "maxInclusive": false,
                "minKg": 30,
                "minKgInclusive": false,
                "doseType": "fixed",
                "min": 30,
                "max": 30,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · deri 12 javë",
                "source": "DailyMed · 1–11 years >30 kg"
              }
            ]
          },
          {
            "label": "GERD jo-eroziv · 12–17 vjeç · 15 mg/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 15,
                "max": 15,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · deri 8 javë",
                "source": "DailyMed · adolescent non-erosive GERD"
              }
            ]
          },
          {
            "label": "Ezofagit eroziv · 12–17 vjeç · 30 mg/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 30,
                "max": 30,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · deri 8 javë",
                "source": "DailyMed · adolescent erosive esophagitis"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Cap – 15mg",
        "Cap – 30mg"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 9 produkte lansoprazole, kryesisht kapsula gastro-rezistente 15 mg dhe 30 mg."
      }
    },
    "Ranitidine": {
      "status": "verified-blocked",
      "badgeSq": "PEZULLUAR · EMA",
      "summarySq": "Ranitidina nuk duhet të ketë kalkulator AUTO në këtë modul: EMA konfirmoi pezullimin e barnave me ranitidinë në BE për shkak të papastërtisë NDMA dhe pasigurive rreth formimit të saj.",
      "warningsSq": [
        "Tabela bazë ruhet vetëm si artefakt i burimit origjinal; doza e saj nuk përdoret për llogaritje.",
        "Përdor alternativë të përshtatshme sipas indikacionit dhe udhëzimit aktual."
      ],
      "sources": [
        {
          "authority": "EMA",
          "title": "Ranitidine-containing medicinal products · EU suspension",
          "url": "https://www.ema.europa.eu/en/medicines/human/referrals/ranitidine-containing-medicinal-products"
        }
      ],
      "calculator": {
        "replace": true,
        "disabled": true,
        "reasonSq": "AUTO i çaktivizuar: ranitidina është e pezulluar në BE sipas EMA."
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "0 produkte ranitidine të publikuara u gjetën në regjistrin lokal në kontrollin aktual."
      }
    },
    "Ondansetron": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · CPS",
      "summarySq": "Gastroenterit akut në urgjencë: ≥6 muaj, 0,15 mg/kg nga goja si dozë e vetme, maksimum 8 mg; ORT nis 15–30 minuta më pas. Nuk rekomandohet skemë multidose rutinë.",
      "warningsSq": [
        "Përdoret për të mbështetur rehidratimin oral te të vjellat nga gastroenteriti me dehidrim të lehtë–mesatar ose pas dështimit të ORT; jo si zëvendësim i rehidratimit.",
        "Mos e përdor rutinë kur diarrea mesatare–e rëndë është simptoma dominuese. Kujdes te faktorët e rrezikut për QT të zgjatur."
      ],
      "sources": [
        {
          "authority": "Canadian Paediatric Society",
          "title": "Oral ondansetron for acute gastroenteritis-related vomiting",
          "url": "https://cps.ca/en/documents/position/oral-ondansetron"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Gastroenterit akut · ≥6 muaj · 0,15 mg/kg PO dozë e vetme",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 6,
                "doseType": "weight",
                "min": 0.15,
                "max": 0.15,
                "unit": "mg",
                "period": "dose",
                "frequency": "dozë e vetme · ORT pas 15–30 min",
                "maxPerDose": 8,
                "source": "CPS · acute gastroenteritis",
                "noteSq": "Nuk ka përfitim nga multidose rutinë në këtë indikacion."
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 4/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 11 produkte ondansetron; u konfirmua shurup 4 mg/5 mL, ODT 8 mg dhe forma injektabile 2 mg/mL."
      }
    },
    "Fexofenadine": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed 2026",
      "summarySq": "Për rinit alergjik/urtikarie: 6–11 vjeç 30 mg çdo 12 orë; ≥12 vjeç 60 mg çdo 12 orë ose 180 mg një herë/ditë. Doza pediatrike kërkon formulim të përshtatshëm.",
      "warningsSq": [
        "Te sëmundja renale doza fillestare reduktohet sipas etiketës.",
        "Mos e merr me lëng grejpfruti, portokalli ose molle; antacidet me alumin/magnez mund ta ulin përthithjen.",
        "Regjistri lokal aktual ka vetëm tableta 120 mg; kjo nuk përputhet me dozat 30/60/180 mg të etiketës, prandaj nuk jepet konvertim praktik AUTO."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Fexofenadine hydrochloride tablets · pediatric dosage",
          "url": "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=a3d17e8d-a8ce-4e1a-9ec2-13736af1d7b5"
        },
        {
          "authority": "DailyMed",
          "title": "Children's fexofenadine oral suspension 30 mg/5 mL",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=84988f6d-85b1-45dd-89be-0333acc6b180"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "6–11 vjeç · 30 mg q12h",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 72,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 30,
                "max": 30,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë",
                "source": "DailyMed · children 6–11 years"
              }
            ]
          },
          {
            "label": "≥12 vjeç · 60 mg q12h",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 60,
                "max": 60,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë",
                "source": "DailyMed · ≥12 years"
              }
            ]
          },
          {
            "label": "≥12 vjeç · 180 mg 1 herë/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 180,
                "max": 180,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë",
                "source": "DailyMed · ≥12 years once-daily option"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 2 produkte fexofenadine, të dyja tableta 120 mg; nuk u konfirmua suspension pediatrik."
      }
    },
    "Salbutamol": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Nebulizim për bronkospazëm: 2–12 vjeç 0,1–0,15 mg/kg/dozë, maksimum 2,5 mg, 3–4 herë/ditë. ≥12 vjeç doza e zakonshme është 2,5 mg 3–4 herë/ditë.",
      "warningsSq": [
        "Ky audit automatizon vetëm nebulizimin; doza e MDI duhet të menaxhohet veçmas sipas pajisjes/spacer-it dhe planit të astmës.",
        "Nevoja për doza më të shpeshta se zakonisht kërkon rivlerësim të kontrollit të astmës; teprimi mund të shkaktojë takikardi, tremor dhe hipokalemi."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Albuterol sulfate inhalation solution 0.5% · pediatric nebulized dosing",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d476c926-4c3d-4c33-b244-3b58e988ecb3"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Nebulizim · 2–<12 vjeç · 0,1–0,15 mg/kg/dozë",
            "mode": "clinicalRules",
            "route": "nebulized",
            "rules": [
              {
                "minMonths": 24,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 0.1,
                "max": 0.15,
                "unit": "mg",
                "period": "dose",
                "frequency": "3–4 herë/ditë me nebulizim",
                "maxPerDose": 2.5,
                "source": "DailyMed · children 2–12 years"
              }
            ]
          },
          {
            "label": "Nebulizim · ≥12 vjeç · 2,5 mg/dozë",
            "mode": "clinicalRules",
            "route": "nebulized",
            "rules": [
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 2.5,
                "max": 2.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "3–4 herë/ditë me nebulizim",
                "source": "DailyMed · adults and children over 12 years"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Respiratory solution – 5mg/1ml",
        "Respules – 2.5mg/2.5ml"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 27 produkte salbutamol, përfshirë solucion 5 mg/mL dhe respula 2,5 mg/2,5 mL, si dhe MDI 100 mcg/dozë."
      }
    },
    "Prednisolone": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · SmPC",
      "summarySq": "Asthmë akute: <2 vjeç 10 mg/ditë vetëm në spital; 2–5 vjeç 20 mg/ditë; >5 vjeç 30–40 mg/ditë, zakonisht deri 3 ditë. Te fëmijët që tashmë marrin steroid mirëmbajtës: 2 mg/kg deri 60 mg.",
      "warningsSq": [
        "Doza e prednisolonit është shumë indikacion-specifike; ky kalkulator automatizon vetëm skemën e astmës akute nga SmPC.",
        "Kur fëmija nuk e mban dozën orale për shkak të të vjellave, SmPC këshillon të merret në konsideratë terapi IV; një kurs i shkurtër deri 3 ditë zakonisht nuk kërkon taper."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Prednisolone 10 mg/mL oral solution · acute asthma in children",
          "url": "https://www.medicines.org.uk/emc/product/3370/smpc"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Asthmë akute · sipas moshës · deri 3 ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 24,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 10,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · deri 3 ditë · vetëm në spital",
                "source": "SmPC · under 2 years"
              },
              {
                "minMonths": 24,
                "maxMonths": 72,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 20,
                "max": 20,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · deri 3 ditë",
                "source": "SmPC · 2–5 years"
              },
              {
                "minMonths": 72,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 30,
                "max": 40,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · deri 3 ditë",
                "source": "SmPC · over 5 years"
              }
            ]
          },
          {
            "label": "Asthmë akute · fëmijë në steroid mirëmbajtës · 2 mg/kg",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 2,
                "max": 2,
                "unit": "mg",
                "period": "dose",
                "frequency": "1 herë/ditë · kurs i shkurtër",
                "maxPerDose": 60,
                "source": "SmPC · child already receiving maintenance steroid"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 5/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka shumë produkte prednisolone; u konfirmuan edhe solucione orale 1 mg/mL (ekuivalent 5 mg/5 mL), krahas përqendrimeve të tjera dhe formave parenterale."
      }
    },
    "Iron": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · RCH CPG",
      "summarySq": "Dozat llogariten si hekur elementar. Trajtimi i mungesës së hekurit/IDA: 3–6 mg/kg/ditë; për IDA të lehtë–mesatare 3 mg/kg/ditë është referencë praktike. Neonati kërkon udhëzim specifik.",
      "warningsSq": [
        "Gjithmonë llogarit sipas HEKURIT ELEMENTAR, jo sipas peshës së kripës së hekurit.",
        "Për anemi të rëndë (p.sh. Hb <80 g/L në CPG) kërkohet ndjekje e hershme dhe mund të nevojitet 6 mg/kg/ditë; shkaku i anemisë duhet vlerësuar.",
        "Mos jep hekur oral dhe parenteral njëkohësisht; pas infuzionit oralja zakonisht mbahet të paktën 1 javë sipas CPG."
      ],
      "sources": [
        {
          "authority": "Royal Children's Hospital Melbourne",
          "title": "Clinical Practice Guideline · Iron deficiency",
          "url": "https://www.rch.org.au/clinicalguide/guideline_index/Iron_deficiency/"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "IDA e lehtë–mesatare · >1 muaj · 3 mg/kg/ditë hekur elementar",
            "mode": "clinicalRules",
            "route": "oral",
            "componentBasis": "elemental iron",
            "rules": [
              {
                "minMonths": 1,
                "doseType": "weight",
                "min": 3,
                "max": 3,
                "unit": "mg",
                "period": "day",
                "frequency": "1 herë/ditë ose sipas tolerancës/protokollit",
                "source": "RCH CPG · mild–moderate IDA",
                "noteSq": "Doza është hekur elementar."
              }
            ]
          },
          {
            "label": "IDA e rëndë · >1 muaj · 6 mg/kg/ditë hekur elementar",
            "mode": "clinicalRules",
            "route": "oral",
            "componentBasis": "elemental iron",
            "rules": [
              {
                "minMonths": 1,
                "doseType": "weight",
                "min": 6,
                "max": 6,
                "unit": "mg",
                "period": "day",
                "frequency": "sipas planit klinik · ndjekje e hershme",
                "source": "RCH CPG · severe anaemia",
                "noteSq": "Doza është hekur elementar; vlerëso shkakun dhe përgjigjen."
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Dps – 20/1"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka produkte orale me 20 mg hekur/1 mL; kalkulatori e interpreton këtë vetëm si hekur elementar kur etiketa e produktit e konfirmon."
      }
    },
    "Ampicillin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · WHO",
      "summarySq": "Ampicilina parenterale është indikacion- dhe moshë-specifike. Për sepsë të dyshuar te 0–59 ditë: 50 mg/kg/dozë q12h në javën e parë dhe q8h pas javës së parë. Për infeksion të rëndë te 2 muaj–<5 vjeç: 50 mg/kg/dozë q6h.",
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
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Sepsë e dyshuar · 0–7 ditë · 50 mg/kg q12h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 0.23,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 50,
                "max": 50,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · IM/IV",
                "source": "WHO 2024 · first week of life"
              }
            ]
          },
          {
            "label": "Sepsë e dyshuar · >7–59 ditë · 50 mg/kg q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 0.23,
                "maxMonths": 2,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 50,
                "max": 50,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë · IM/IV",
                "source": "WHO 2024 · after first week to 59 days"
              }
            ]
          },
          {
            "label": "Infeksion i rëndë · 2 muaj–<5 vjeç · 50 mg/kg q6h",
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
                "frequency": "çdo 6 orë · IM/IV",
                "source": "WHO paediatric hospital care"
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
      }
    },
    "Cloxacillin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · MSF/WHO",
      "summarySq": "Për infeksione të rënda stafilokoksike te fëmijët ≥1 muaj: 25–50 mg/kg/dozë IV çdo 6 orë, maksimum 2 g/dozë. Neonati ka intervale të ndryshme sipas ditëve të jetës dhe peshës.",
      "warningsSq": [
        "AUTO bllokohet nën 1 muaj në këtë modul sepse regjimi neonatal kërkon ditët e sakta të jetës dhe peshën <2 kg kundrejt ≥2 kg.",
        "Nuk u konfirmua produkt cloxacillin i publikuar në regjistrin lokal; mos improvizo formulim nga kombinimi ampicillin/cloxacillin i tabelës së vjetër."
      ],
      "sources": [
        {
          "authority": "MSF Medical Guidelines",
          "title": "Cloxacillin injectable · severe infections",
          "url": "https://medicalguidelines.msf.org/en/viewport/EssDr/english/cloxacillin-injectable-16682609.html"
        },
        {
          "authority": "WHO AWaRe",
          "title": "Cloxacillin pediatric dosing summary",
          "url": "https://iris.who.int/bitstream/handle/10665/365135/WHO-MHP-HPS-EML-2022.02-eng.pdf"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Infeksion i rëndë stafilokoksik · ≥1 muaj · 25–50 mg/kg IV q6h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 25,
                "max": 50,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 6 orë · infuzion IV",
                "maxPerDose": 2000,
                "source": "MSF · child ≥1 month"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "0 produkte cloxacillin monoterapi të publikuara u gjetën në regjistrin lokal."
      }
    },
    "Penicillin G": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · WHO/DailyMed",
      "summarySq": "Benzylpenicillin (Penicillin G): doza e përgjithshme pediatrike 50 000 U/kg/dozë q6h; për meningjit 100 000 U/kg/dozë q6h në udhëzimin WHO. Regjimet ndryshojnë sipas patogjenit dhe indikacionit.",
      "warningsSq": [
        "Neonati/prematuri kërkon interval specifik dhe nuk duhet të marrë automatikisht q6h vetëm nga pesha.",
        "DailyMed jep doza të ndryshme sipas infeksionit; përdor kulturën/sensitivitetin dhe protokollin lokal."
      ],
      "sources": [
        {
          "authority": "WHO paediatric hospital care",
          "title": "Benzylpenicillin (penicillin G) pediatric dosage",
          "url": "https://platform.who.int/docs/default-source/mca-documents/policy-documents/operational-guidance/eth-ch-41-01-operationalguidance-2016-eng-paediatric-hospital-care-guidelines-practitioners.pdf"
        },
        {
          "authority": "DailyMed/FDA label",
          "title": "Penicillin G potassium · pediatric dosage by indication",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=969a421e-37d8-499e-9e89-67e210bd5d9d"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Dozë e përgjithshme · ≥1 muaj · 50 000 U/kg q6h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 50000,
                "max": 50000,
                "unit": "U",
                "period": "dose",
                "frequency": "çdo 6 orë · IV/IM",
                "source": "WHO paediatric hospital care"
              }
            ]
          },
          {
            "label": "Meningjit · ≥1 muaj · 100 000 U/kg q6h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 100000,
                "max": 100000,
                "unit": "U",
                "period": "dose",
                "frequency": "çdo 6 orë · IV",
                "source": "WHO paediatric hospital care"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Vial – 1 million U"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 9 produkte benzylpenicillin/Penicillin G, përfshirë flakonë 1 000 000 IU; disa produkte janë depo/kombinime dhe nuk janë të barasvlershme me Penicillin G IV."
      }
    },
    "Levofloxacin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Pediatrikisht etiketa e referuar e levofloxacin mbulon antraks inhalator post-ekspozim dhe murtajë: ≥6 muaj, <50 kg 8 mg/kg/dozë q12h (maks. 250 mg/dozë); ≥50 kg 500 mg q24h.",
      "warningsSq": [
        "Mos e përdor këtë skemë si dozë universale për pneumoni/UTI pediatrike; indikacionet pediatrike të etiketës janë të kufizuara.",
        "Fluorokinolonet kanë paralajmërime serioze për efekte muskuloskeletale, neurologjike dhe të tjera; përdorimi duhet të jetë i justifikuar."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Levofloxacin · pediatric anthrax and plague dosing",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a894e40b-77e4-439b-b0f8-9a5cc7a1dd90"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Antraks inhalator post-ekspozim · ≥6 muaj",
            "mode": "clinicalRules",
            "route": "oral_or_injectable",
            "rules": [
              {
                "minMonths": 6,
                "maxMonths": 216,
                "maxInclusive": false,
                "maxKg": 50,
                "maxKgInclusive": false,
                "doseType": "weight",
                "min": 8,
                "max": 8,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 60 ditë",
                "maxPerDose": 250,
                "source": "DailyMed · inhalational anthrax <50 kg"
              },
              {
                "minMonths": 6,
                "maxMonths": 216,
                "maxInclusive": false,
                "minKg": 50,
                "doseType": "fixed",
                "min": 500,
                "max": 500,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 24 orë · 60 ditë",
                "source": "DailyMed · inhalational anthrax ≥50 kg"
              }
            ]
          },
          {
            "label": "Murtajë · ≥6 muaj",
            "mode": "clinicalRules",
            "route": "oral_or_injectable",
            "rules": [
              {
                "minMonths": 6,
                "maxMonths": 216,
                "maxInclusive": false,
                "maxKg": 50,
                "maxKgInclusive": false,
                "doseType": "weight",
                "min": 8,
                "max": 8,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · 10–14 ditë",
                "maxPerDose": 250,
                "source": "DailyMed · plague <50 kg"
              },
              {
                "minMonths": 6,
                "maxMonths": 216,
                "maxInclusive": false,
                "minKg": 50,
                "doseType": "fixed",
                "min": 500,
                "max": 500,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 24 orë · 10–14 ditë",
                "source": "DailyMed · plague ≥50 kg"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Infusion – 5mg/1ml"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 32 produkte levofloxacin, përfshirë infusion 5 mg/mL dhe tableta 250/500/750 mg."
      }
    },
    "Amikacin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Me funksion renal normal: fëmijë/foshnja më të mëdha 15 mg/kg/ditë, si 7,5 mg/kg q12h ose 5 mg/kg q8h. Te i porsalinduri: loading 10 mg/kg, pastaj 7,5 mg/kg q12h.",
      "warningsSq": [
        "Kërkohet vlerësim renal dhe, kur është e mundur, monitorim peak/trough; ototoksiciteti dhe nefrotoksiciteti janë rreziqe kryesore.",
        "Doza totale ditore nuk duhet të kalojë 15 mg/kg/ditë; në pesha të mëdha etiketa kufizon 1,5 g/ditë."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Amikacin sulfate injection · pediatric dosing and monitoring",
          "url": "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7791d3e1-9287-4f75-b4f0-e5d35cacfd6e"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "I porsalindur · loading 10 mg/kg",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 1,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 10,
                "max": 10,
                "unit": "mg",
                "period": "dose",
                "frequency": "dozë ngarkuese",
                "source": "DailyMed · newborn loading dose"
              }
            ]
          },
          {
            "label": "I porsalindur · mirëmbajtje 7,5 mg/kg q12h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 1,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 7.5,
                "max": 7.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · TDM",
                "maxDailyPerKg": 15,
                "source": "DailyMed · newborn maintenance"
              }
            ]
          },
          {
            "label": "≥1 muaj · 7,5 mg/kg q12h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 7.5,
                "max": 7.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · TDM",
                "maxDailyPerKg": 15,
                "maxPerDay": 1500,
                "source": "DailyMed · normal renal function"
              }
            ]
          },
          {
            "label": "≥1 muaj · 5 mg/kg q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 5,
                "max": 5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë · TDM",
                "maxDailyPerKg": 15,
                "maxPerDay": 1500,
                "source": "DailyMed · normal renal function"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Vial – 500mg/2ml"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 5 produkte amikacin injektabile, të gjitha me 500 mg/2 mL të konfirmuar."
      }
    },
    "Gentamicin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Me funksion renal normal: ≤7 ditë 2,5 mg/kg q12h; neonat/foshnja më të mëdha 2,5 mg/kg q8h; fëmijë ≥1 muaj 2–2,5 mg/kg q8h.",
      "warningsSq": [
        "Gentamicina kërkon individualizim sipas funksionit renal dhe monitorim peak/trough kur është e mundur.",
        "Skemat once-daily përdoren në shumë protokolle moderne; ky audit ruan regjimin e etiketës DailyMed dhe nuk e paraqet si universal."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Gentamicin injection · pediatric dosing and serum monitoring",
          "url": "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=8bdeef7f-ad8e-46e0-a872-e945eae51d68"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "0–7 ditë · 2,5 mg/kg q12h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 0.23,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 2.5,
                "max": 2.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · TDM",
                "source": "DailyMed · premature/full-term neonate ≤1 week"
              }
            ]
          },
          {
            "label": ">7 ditë–<1 muaj · 2,5 mg/kg q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 0.23,
                "maxMonths": 1,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 2.5,
                "max": 2.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë · TDM",
                "source": "DailyMed · infants/neonates"
              }
            ]
          },
          {
            "label": "≥1 muaj · 2–2,5 mg/kg q8h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 2,
                "max": 2.5,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 8 orë · TDM",
                "source": "DailyMed · children"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Vial – 40mg/1ml"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka forma injektabile gentamicin, përfshirë 40 mg/mL dhe 80 mg/2 mL; format okulare/topike nuk përdoren nga ky kalkulator sistemik."
      }
    },
    "Cefoperazone": {
      "status": "verified-blocked",
      "badgeSq": "AUDITUAR · AUTO I BLLOKUAR",
      "summarySq": "Rreshti bazë përzien emrin 'cefoperazone' me formulim cefoperazone/sulbactam. Doza e kombinimit varet nga raporti 2:1 kundrejt 1:1; regjistri lokal ka produkt 1 g + 1 g, ndërsa tabela bazë shfaq 1 g + 0,5 g.",
      "warningsSq": [
        "Mos llogarit dozën e cefoperazone monoterapi mbi një flakon kombinim pa përcaktuar raportin dhe bazën e dozës.",
        "WHO përshkruan doza pediatrike të ndryshme për raportin 2:1 dhe 1:1; kjo e bën formulën e vetme të tabelës bazë të pasigurt për AUTO."
      ],
      "sources": [
        {
          "authority": "WHO EML review",
          "title": "Cefoperazone/sulbactam · dosing differs by 2:1 versus 1:1 formulation",
          "url": "https://cdn.who.int/media/docs/default-source/2025-eml-expert-committee/other-matters/o.2_cefoperazone-sulbactam.pdf?sfvrsn=3aa8c360_7"
        }
      ],
      "calculator": {
        "replace": true,
        "disabled": true,
        "reasonSq": "AUTO i bllokuar: së pari duhet zgjedhur produkti dhe raporti cefoperazone:sulbactam (2:1 ose 1:1)."
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 1 produkt cefoperazone/sulbactam të publikuar me forcë 1 g + 1 g (raport 1:1), jo formulimin 1 g + 0,5 g të tabelës bazë."
      }
    },
    "Cefotaxime": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · WHO",
      "summarySq": "Te fëmijët jashtë periudhës neonatale, referenca WHO jep cefotaxime 50 mg/kg/dozë IV çdo 6 orë. Prematurët dhe java e parë e jetës kanë intervale më të gjata.",
      "warningsSq": [
        "AUTO bllokohet nën 1 muaj për të mos fshehur dallimet e prematuritetit/javës së parë.",
        "Funksioni renal dhe indikacioni mund të kërkojnë përshtatje; meningjiti duhet menaxhuar sipas protokollit aktual."
      ],
      "sources": [
        {
          "authority": "WHO paediatric hospital care",
          "title": "Cefotaxime pediatric dosage and neonatal interval notes",
          "url": "https://iris.who.int/bitstream/handle/10665/42335/1/WHO_FCH_CAH_00.1.pdf"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "≥1 muaj · 50 mg/kg IV q6h",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 1,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 50,
                "max": 50,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 6 orë · IV",
                "source": "WHO paediatric hospital care"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Vial – 1g"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 2 produkte cefotaxime monoterapi, të dyja flakonë 1 g."
      }
    },
    "Colistin": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · SmPC/EMA",
      "summarySq": "Colistimethate sodium IV: ≤40 kg 75 000–150 000 IU/kg/ditë në 3 doza; >40 kg mund të merret në konsideratë doza adulte 9 milion IU/ditë në 2–3 doza. Doza duhet shkruar në IU.",
      "warningsSq": [
        "Gabimet IU ↔ mg CBA/CMS janë të njohura; ky kalkulator përdor vetëm IU dhe nuk konverton automatikisht në mg colistin base.",
        "Të dhënat pediatrike janë të kufizuara; maturimi renal dhe insuficienca renale kërkojnë individualizim. Kujdes me nefro- dhe neurotoksicitetin."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Colomycin · systemic pediatric dosing in IU",
          "url": "https://www.medicines.org.uk/emc/product/9664/smpc"
        },
        {
          "authority": "EMA",
          "title": "Polymyxin-containing medicines · harmonised colistimethate dosing",
          "url": "https://www.ema.europa.eu/en/medicines/human/referrals/polymyxin-containing-medicines"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "IV sistemik · ≤40 kg · 75 000–150 000 IU/kg/ditë ÷3",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 216,
                "maxInclusive": false,
                "maxKg": 40,
                "doseType": "weight",
                "min": 75000,
                "max": 150000,
                "unit": "U",
                "period": "day",
                "frequency": "3 doza/ditë · IV",
                "split": 3,
                "source": "SmPC · children ≤40 kg"
              }
            ]
          },
          {
            "label": "IV sistemik · >40 kg · 9 milion IU/ditë",
            "mode": "clinicalRules",
            "route": "injectable",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 216,
                "maxInclusive": false,
                "minKg": 40,
                "minKgInclusive": false,
                "doseType": "fixed",
                "min": 9000000,
                "max": 9000000,
                "unit": "U",
                "period": "day",
                "frequency": "2–3 doza/ditë · IV",
                "split": 3,
                "source": "SmPC · adult dose may be considered above 40 kg",
                "noteSq": "Kalkulatori e ndan në 3 për paraqitje praktike; skema 2–3 doza zgjidhet klinikisht."
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Vial – 1 million U"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 5 produkte colistimethate/colistin, të gjitha të shënuara 1 000 000 IU për flakon; rruga mund të jetë IV ose nebulizim sipas produktit."
      }
    },
    "Doxycycline": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · CDC",
      "summarySq": "Për infeksione rikeciale të dyshuara: fëmijë <45 kg 2,2 mg/kg/dozë q12h, maksimum 100 mg/dozë; ≥45 kg 100 mg q12h. Doxycycline është terapi e linjës së parë në të gjitha moshat për këto infeksione.",
      "warningsSq": [
        "Kjo skemë është specifike për sëmundjet rikeciale/ehrlichiosis, jo dozë universale për çdo indikacion të doxycycline.",
        "Trajtimi zakonisht vazhdon së paku 5–7 ditë dhe deri ≥72 orë pas zhdukjes së temperaturës me përmirësim klinik."
      ],
      "sources": [
        {
          "authority": "CDC",
          "title": "Clinical care of spotted fever rickettsioses · doxycycline in children",
          "url": "https://cdc.gov/other-spotted-fever/hcp/clinical-care/index.html"
        },
        {
          "authority": "CDC",
          "title": "Clinical care of ehrlichiosis · pediatric doxycycline dose",
          "url": "https://www.cdc.gov/ehrlichiosis/hcp/clinical-care/index.html"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Rikeciozë/ehrlichiosis · <45 kg · 2,2 mg/kg q12h",
            "mode": "clinicalRules",
            "route": "oral_or_injectable",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 216,
                "maxInclusive": false,
                "maxKg": 45,
                "maxKgInclusive": false,
                "doseType": "weight",
                "min": 2.2,
                "max": 2.2,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · së paku 5–7 ditë",
                "maxPerDose": 100,
                "source": "CDC · children <45 kg"
              }
            ]
          },
          {
            "label": "Rikeciozë/ehrlichiosis · ≥45 kg · 100 mg q12h",
            "mode": "clinicalRules",
            "route": "oral_or_injectable",
            "rules": [
              {
                "minMonths": 0,
                "maxMonths": 216,
                "maxInclusive": false,
                "minKg": 45,
                "doseType": "fixed",
                "min": 100,
                "max": 100,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 12 orë · së paku 5–7 ditë",
                "source": "CDC · ≥45 kg/adult dose"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Tab – 100mg"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka 5 produkte doxycycline, të gjitha forma solide 100 mg; nuk u konfirmua formulim pediatrik likuid."
      }
    },
    "DEC": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · CDC",
      "summarySq": "Diethylcarbamazine (DEC) për filariazë limfatike te fëmijët >18 muaj: 6 mg/kg/ditë. CDC përshkruan kurs 1-ditor ose 12-ditor sipas protokollit.",
      "warningsSq": [
        "DEC nuk është bar antiparazitar 'universal'; diagnoza e filariazës duhet konfirmuar dhe trajtimi shpesh koordinohet me ekspertizë infektologjike/tropikale.",
        "Nuk u gjet produkt DEC i publikuar në regjistrin lokal."
      ],
      "sources": [
        {
          "authority": "CDC",
          "title": "Clinical treatment of lymphatic filariasis",
          "url": "https://cdc.gov/filarial-worms/hcp/clinical-care/index.html"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Filariazë limfatike · >18 muaj · 6 mg/kg/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 18,
                "minInclusive": false,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 6,
                "max": 6,
                "unit": "mg",
                "period": "day",
                "frequency": "totali në 24 orë · kurs 1 ose 12 ditë sipas protokollit",
                "source": "CDC · lymphatic filariasis"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "0 produkte diethylcarbamazine të publikuara u gjetën në regjistrin lokal."
      }
    },
    "Diclofenac": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · SmPC",
      "summarySq": "Përdorimi pediatrik i verifikuar nuk është '1 mg/kg q8h' për çdo dhimbje. JIA/JCA 1–3 mg/kg/ditë në 2–3 doza te 1–12 vjeç; dhimbje postoperative 1–2 mg/kg/ditë në doza të ndara te 6–12 vjeç, maksimum 4 ditë.",
      "warningsSq": [
        "Përdor dozën më të ulët efektive për kohën më të shkurtër; rreziku GI, renal dhe reaksionet nga NSAID mbeten relevante.",
        "Formulimet pediatric të SmPC janë supozitorë 12,5/25 mg; mos transfero automatikisht dozën te formulime të tjera pa kontrolluar etiketën."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Voltarol 12.5 mg suppositories · pediatric JIA and postoperative dosing",
          "url": "https://www.medicines.org.uk/emc/product/1044/smpc"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "JIA/JCA · 1–12 vjeç · 1–3 mg/kg/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 12,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "weight",
                "min": 1,
                "max": 3,
                "unit": "mg",
                "period": "day",
                "frequency": "në 2–3 doza",
                "source": "SmPC · juvenile chronic arthritis"
              }
            ]
          },
          {
            "label": "Dhimbje postoperative · 6–12 vjeç · 1–2 mg/kg/ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 72,
                "maxMonths": 144,
                "maxInclusive": true,
                "doseType": "weight",
                "min": 1,
                "max": 2,
                "unit": "mg",
                "period": "day",
                "frequency": "në doza të ndara · maksimum 4 ditë",
                "source": "SmPC · acute postoperative pain"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka supozitorë diclofenac 12,5 mg dhe 25 mg, por ky kalkulator nuk automatizon ndarjen e formave solide/rek­tale."
      }
    },
    "Mefenamic acid": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · SmPC",
      "summarySq": "Fëmijë >6 muaj: 25 mg/kg/ditë me mefenamic acid në doza të ndara; suspensioni mund të jepet deri 3 herë/ditë. Për indikacione të tjera përveç Still's disease, terapia pediatrike nuk duhet të kalojë 7 ditë.",
      "warningsSq": [
        "Jepet me ose pas ushqimit. Si NSAID, shmanget te ulçera/gjakderdhja GI, insuficienca e rëndë renale dhe reaksionet e mëparshme ndaj NSAID.",
        "Përqendrimi lokal i konfirmuar 250 mg/5 mL është shumë më i fortë se 50/5 ose 100/5 në tabelën bazë; kalkulatori duhet të përdorë vetëm përqendrimin e zgjedhur."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Mefenamic Acid 50 mg/5 mL suspension · pediatric posology",
          "url": "https://www.medicines.org.uk/emc/product/13316/smpc"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": ">6 muaj · 25 mg/kg/ditë ÷3 · maksimum 7 ditë",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 6,
                "minInclusive": false,
                "maxMonths": 144,
                "maxInclusive": true,
                "doseType": "weight",
                "min": 25,
                "max": 25,
                "unit": "mg",
                "period": "day",
                "frequency": "3 doza/ditë · me/pas ushqimit · ≤7 ditë",
                "split": 3,
                "source": "SmPC · pediatric suspension"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 250/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka suspension mefenamic acid 250 mg/5 mL (Rafreda) dhe tableta 500 mg."
      }
    },
    "CPM": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · SmPC",
      "summarySq": "Chlorphenamine maleate është age-based: 1–2 vjeç 1 mg BID; 2–6 vjeç 1 mg q4–6h; 6–12 vjeç 2 mg q4–6h; ≥12 vjeç 4 mg q4–6h, me maksimumet ditore të etiketës.",
      "warningsSq": [
        "Nuk rekomandohet nën 1 vjeç në SmPC e referuar.",
        "Sedacioni dhe efektet antikolinergjike janë të rëndësishme; mos përdor preparate të kombinuara për kollë/ftohje si zëvendësim automatik të chlorphenamine monoterapi."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Piriton syrup 2 mg/5 mL · pediatric posology",
          "url": "https://www.medicines.org.uk/emc/product/3928/smpc"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Alergji · sipas moshës",
            "mode": "clinicalRules",
            "route": "oral",
            "rules": [
              {
                "minMonths": 12,
                "maxMonths": 24,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 1,
                "max": 1,
                "unit": "mg",
                "period": "dose",
                "frequency": "2 herë/ditë · maks. 2 mg/24 h",
                "maxPerDay": 2,
                "source": "SmPC · 1–2 years"
              },
              {
                "minMonths": 24,
                "maxMonths": 72,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 1,
                "max": 1,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 4–6 orë · maks. 6 mg/24 h",
                "maxPerDay": 6,
                "source": "SmPC · 2–6 years"
              },
              {
                "minMonths": 72,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 2,
                "max": 2,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 4–6 orë · maks. 12 mg/24 h",
                "maxPerDay": 12,
                "source": "SmPC · 6–12 years"
              },
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 4,
                "max": 4,
                "unit": "mg",
                "period": "dose",
                "frequency": "çdo 4–6 orë · maks. 24 mg/24 h",
                "maxPerDay": 24,
                "source": "SmPC · ≥12 years"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [
        "Syp – 2/5"
      ],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal përmban chlorphenamine 2 mg/5 mL dhe 4 mg tableta, por shumë rezultate janë kombinime me barna të tjera; AUTO përdor vetëm monoterapinë."
      }
    },
    "Levo salbutamol": {
      "status": "verified-corrected",
      "badgeSq": "VERIFIKUAR · DailyMed",
      "summarySq": "Levalbuterol nebulized: 6–11 vjeç 0,31 mg TID; rutinë nuk duhet të kalojë 0,63 mg TID. ≥12 vjeç 0,63 mg TID q6–8h; maksimum 1,25 mg TID.",
      "warningsSq": [
        "Nuk është thjesht 'gjysma e salbutamolit' për çdo situatë; doza e etiketës është age- dhe formulim-specifike.",
        "Nuk u konfirmua produkt levalbuterol/levosalbutamol i publikuar në regjistrin lokal; mos konverto automatikisht te preparatet salbutamol racemik."
      ],
      "sources": [
        {
          "authority": "DailyMed/FDA label",
          "title": "Levalbuterol inhalation solution · pediatric dosing",
          "url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d4080fc5-50d6-49a9-8a63-7769d201968d"
        }
      ],
      "calculator": {
        "replace": true,
        "options": [
          {
            "label": "Nebulizim · 6–11 vjeç · 0,31 mg TID",
            "mode": "clinicalRules",
            "route": "nebulized",
            "rules": [
              {
                "minMonths": 72,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 0.31,
                "max": 0.31,
                "unit": "mg",
                "period": "dose",
                "frequency": "3 herë/ditë me nebulizim",
                "source": "DailyMed · children 6–11 years"
              }
            ]
          },
          {
            "label": "Nebulizim · 6–11 vjeç · kufiri rutinë 0,63 mg TID",
            "mode": "clinicalRules",
            "route": "nebulized",
            "rules": [
              {
                "minMonths": 72,
                "maxMonths": 144,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 0.63,
                "max": 0.63,
                "unit": "mg",
                "period": "dose",
                "frequency": "3 herë/ditë · jo mbi këtë rutinë",
                "source": "DailyMed · routine maximum 6–11 years"
              }
            ]
          },
          {
            "label": "Nebulizim · ≥12 vjeç · 0,63 mg q6–8h",
            "mode": "clinicalRules",
            "route": "nebulized",
            "rules": [
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 0.63,
                "max": 0.63,
                "unit": "mg",
                "period": "dose",
                "frequency": "3 herë/ditë · çdo 6–8 orë",
                "source": "DailyMed · ≥12 years"
              }
            ]
          },
          {
            "label": "Nebulizim · ≥12 vjeç · maksimum 1,25 mg TID",
            "mode": "clinicalRules",
            "route": "nebulized",
            "rules": [
              {
                "minMonths": 144,
                "maxMonths": 216,
                "maxInclusive": false,
                "doseType": "fixed",
                "min": 1.25,
                "max": 1.25,
                "unit": "mg",
                "period": "dose",
                "frequency": "3 herë/ditë · maksimum",
                "source": "DailyMed · ≥12 years maximum"
              }
            ]
          }
        ]
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "0 produkte levalbuterol/levosalbutamol të publikuara u gjetën në regjistrin lokal; preparatet salbutamol nuk konsiderohen ekuivalente AUTO."
      }
    },
    "Calcium": {
      "status": "verified-blocked",
      "badgeSq": "AUDITUAR · AUTO I BLLOKUAR",
      "summarySq": "Rreshti 'Calcium 50–150 mg/kg/day' është klinikisht i paqartë: nuk përcakton indikacionin, kripën, rrugën apo nëse mg i referohen kalciumit elementar. Këto ndryshojnë dozën në mënyrë thelbësore.",
      "warningsSq": [
        "Kalcium gluconate IV për hipokalcemi akute dozohet në mL/kg ose mmol/kg me monitorim; suplementet orale dozojnë kalcium elementar dhe kanë skema krejt të tjera.",
        "Mos llogarit mL/tableta nga '50–150 mg/kg/day' pa përcaktuar produktin dhe indikacionin."
      ],
      "sources": [
        {
          "authority": "emc SmPC",
          "title": "Calcium gluconate 10% injection/infusion · pediatric hypocalcaemia dosing",
          "url": "https://www.medicines.org.uk/emc/product/6264/smpc"
        },
        {
          "authority": "emc SmPC",
          "title": "Calvive 1000 · oral elemental calcium supplementation",
          "url": "https://www.medicines.org.uk/emc/product/1191/smpc"
        }
      ],
      "calculator": {
        "replace": true,
        "disabled": true,
        "reasonSq": "AUTO i bllokuar: zgjidh indikacionin, rrugën, kripën e kalciumit dhe sasinë e kalciumit elementar para llogaritjes."
      },
      "practicalFormulations": [],
      "kosovoMarket": {
        "checkedAt": "2026-09-28",
        "summarySq": "Regjistri lokal ka shumë produkte që përmbajnë kalcium në kripëra/kombinime të ndryshme; kërkimi i përgjithshëm nuk është bazë e sigurt për një kalkulator pediatrik unik."
      }
    }
  },
  "wave2": {
    "completedAt": "2026-09-28",
    "addedDrugs": [
      "Piperacillin + Tazobactam",
      "Meropenem",
      "Cotrimoxazole (TMP + SMZ)",
      "Azithromycin",
      "Cefixime",
      "Cefuroxime",
      "Vancomycin",
      "Acyclovir",
      "Cetirizine"
    ],
    "auditedDrugCount": 20
  },
  "wave3": {
    "completedAt": "2026-09-28",
    "addedDrugs": [
      "Clarithromycin",
      "Cefpodoxime",
      "Ceftazidime",
      "Albendazole",
      "Ivermectin",
      "Levocetirizine",
      "Hydroxyzine",
      "Lansoprazole",
      "Ranitidine"
    ],
    "auditedDrugCount": 29
  },
  "wave4": {
    "completedAt": "2026-09-28",
    "addedDrugs": [
      "Ondansetron",
      "Fexofenadine",
      "Salbutamol",
      "Prednisolone",
      "Iron"
    ],
    "auditedDrugCount": 34
  },
  "wave5": {
    "completedAt": "2026-09-28",
    "addedDrugs": [
      "Ampicillin",
      "Cloxacillin",
      "Penicillin G",
      "Levofloxacin",
      "Amikacin",
      "Gentamicin",
      "Cefoperazone",
      "Cefotaxime",
      "Colistin",
      "Doxycycline",
      "DEC",
      "Diclofenac",
      "Mefenamic acid",
      "CPM",
      "Levo salbutamol",
      "Calcium"
    ],
    "auditedDrugCount": 50
  }
}$clinical_audit_wave5$::jsonb,
  now()
)
on conflict (dataset_key) do update
set version = excluded.version,
    source_kind = excluded.source_kind,
    audit_date = excluded.audit_date,
    payload = excluded.payload,
    updated_at = now();
