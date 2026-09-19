(() => {
  'use strict';

  const TIER_ORDER = Object.freeze({ urgent:0, core:1, recommended:2, conditional:3, manual:4 });
  const TIER_META = Object.freeze({
    urgent:{ label:'Urgjente', description:'Ekzaminime që mund të ndikojnë menjëherë në vendimin klinik' },
    core:{ label:'Fillestare', description:'Work-up bazë me yield të lartë' },
    recommended:{ label:'Të rekomanduara', description:'Plotësojnë vlerësimin sipas prezantimit klinik' },
    conditional:{ label:'Vetëm nëse…', description:'Bëji vetëm kur konteksti klinik i justifikon' },
    manual:{ label:'Shtuar manualisht', description:'Ekzaminime të shtuara nga katalogu' },
  });

  const EXAM_CATEGORIES = Object.freeze([
  {
    "id": "exam-laboratory",
    "title": "Laborator",
    "label": "Laboratorike"
  },
  {
    "id": "exam-cardio",
    "title": "EKG / funksionale",
    "label": "Funksionale"
  },
  {
    "id": "exam-imaging",
    "title": "RTG / CT / MRI",
    "label": "Imazheri"
  },
  {
    "id": "exam-ultrasound",
    "title": "Ultrazë",
    "label": "Ultrazë"
  },
  {
    "id": "exam-other",
    "title": "Ekzaminime tjera",
    "label": "Tjera"
  }
]);
  const EXAM_CATALOG = Object.freeze([
  {
    "id": "exam-cbc",
    "formName": "Hemogram / CBC",
    "albanianName": "Hemogram i plotë",
    "englishName": "Complete Blood Count",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Anemi, leukocitozë/leukopeni dhe çrregullime të trombociteve."
  },
  {
    "id": "exam-crp",
    "formName": "CRP",
    "albanianName": "Proteina C-reaktive",
    "englishName": "C-reactive protein",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Marker jo-specifik i inflamacionit; interpretohet në kontekst klinik."
  },
  {
    "id": "exam-esr",
    "formName": "ESR / Sedimentimi",
    "albanianName": "Shpejtësia e sedimentimit",
    "englishName": "Erythrocyte Sedimentation Rate",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Marker jo-specifik i inflamacionit, më i dobishëm në disa procese kronike."
  },
  {
    "id": "exam-glucose",
    "formName": "Glukoza",
    "albanianName": "Glukoza në gjak",
    "englishName": "Blood glucose",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Hiperglikemi ose hipoglikemi aktuale."
  },
  {
    "id": "exam-hba1c",
    "formName": "HbA1c",
    "albanianName": "Hemoglobina e glikoziluar",
    "englishName": "Glycated hemoglobin",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Ekspozimi mesatar ndaj glukozës gjatë javëve të fundit."
  },
  {
    "id": "exam-electrolytes",
    "formName": "Elektrolitet",
    "albanianName": "Na / K / Ca / Mg",
    "englishName": "Electrolytes",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Çrregullime elektrolitike që mund të shkaktojnë aritmi, dobësi, të vjella ose simptoma neurologjike."
  },
  {
    "id": "exam-renal",
    "formName": "Funksioni renal",
    "albanianName": "Urea / Kreatinina / eGFR",
    "englishName": "Renal function",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Funksion renal dhe ndikim të dehidrimit ose sëmundjes sistemike."
  },
  {
    "id": "exam-liver",
    "formName": "Paneli hepatik",
    "albanianName": "AST / ALT / ALP / GGT / Bilirubina",
    "englishName": "Liver profile",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Dëmtim hepatocelular, kolestazë ose çrregullim hepatobiliar."
  },
  {
    "id": "exam-tsh",
    "formName": "TSH",
    "albanianName": "Hormoni stimulues i tiroides",
    "englishName": "Thyroid-stimulating hormone",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Testi fillestar për shumicën e dyshimeve për disfunksion tiroide."
  },
  {
    "id": "exam-ft4",
    "formName": "FT4",
    "albanianName": "Tiroksina e lirë",
    "englishName": "Free thyroxine",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Plotëson vlerësimin e funksionit tiroide, veçanërisht kur TSH është jonormal."
  },
  {
    "id": "exam-ft3",
    "formName": "FT3",
    "albanianName": "Triiodotironina e lirë",
    "englishName": "Free triiodothyronine",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Mund të ndihmojë kur TSH është i ulët dhe dyshohet hipertiroidizëm."
  },
  {
    "id": "exam-ck",
    "formName": "CK",
    "albanianName": "Kreatin kinaza",
    "englishName": "Creatine kinase",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Dëmtim muskular; interpretohet me simptomat, aktivitetin dhe barnat."
  },
  {
    "id": "exam-ferritin",
    "formName": "Ferritina",
    "albanianName": "Ferritina",
    "englishName": "Ferritin",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Rezervat e hekurit; mund të ndikohet nga inflamacioni."
  },
  {
    "id": "exam-urinalysis",
    "formName": "Urinaliza",
    "albanianName": "Ekzaminimi i urinës",
    "englishName": "Urinalysis",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Gjak, proteinë, leukocite, nitrite, glukozë, ketone dhe gjetje tjera urinare."
  },
  {
    "id": "exam-acr",
    "formName": "ACR urinar",
    "albanianName": "Raporti albuminë/kreatininë në urinë",
    "englishName": "Urine albumin-creatinine ratio",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Albuminuri dhe dëmtim renal."
  },
  {
    "id": "exam-lipase",
    "formName": "Lipaza",
    "albanianName": "Lipaza",
    "englishName": "Lipase",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Mbështet vlerësimin për pankreatit kur tabloja klinike e sugjeron."
  },
  {
    "id": "exam-troponin",
    "formName": "Troponina",
    "albanianName": "Troponina kardiake",
    "englishName": "Cardiac troponin",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Dëmtim miokardial; përdoret vetëm në kontekst klinik të përshtatshëm."
  },
  {
    "id": "exam-ddimer",
    "formName": "D-dimer",
    "albanianName": "D-dimer",
    "englishName": "D-dimer",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Ndihmon në përjashtimin e VTE vetëm kur probabiliteti klinik është i përshtatshëm."
  },
  {
    "id": "exam-bnp",
    "formName": "BNP / NT-proBNP",
    "albanianName": "Peptidet natriuretike",
    "englishName": "BNP / NT-proBNP",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Mbështet vlerësimin e dyshimit për insuficiencë kardiake."
  },
  {
    "id": "exam-lactate",
    "formName": "Laktati",
    "albanianName": "Laktati",
    "englishName": "Lactate",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Hipoperfuzion ose sëmundje kritike; nuk interpretohet i izoluar."
  },
  {
    "id": "exam-vbg-ketones",
    "formName": "Ketone + VBG",
    "albanianName": "Ketone dhe gazra venozë",
    "englishName": "Ketones and venous blood gas",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Ketoacidozë dhe status acid-bazë kur dyshohet DKA ose dekompensim metabolik."
  },
  {
    "id": "exam-stool",
    "formName": "Mikrobiologjia e feçeve",
    "albanianName": "Kulturë / PCR e feçeve",
    "englishName": "Stool microbiology",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Etiologji infektive në diarretë e zgjedhura, jo rutinë në çdo rast."
  },
  {
    "id": "exam-fit",
    "formName": "FIT",
    "albanianName": "Test imunokimik fekal",
    "englishName": "Faecal immunochemical test",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Gjak okult në feçe në kontekste të zgjedhura gastrointestinale."
  },
  {
    "id": "exam-pregnancy",
    "formName": "Test shtatzënie",
    "albanianName": "β-hCG / test shtatzënie",
    "englishName": "Pregnancy test",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Shtatzëni kur është klinikisht relevante për simptomat ose imazherinë."
  },
  {
    "id": "exam-osmolality",
    "formName": "Osmolaliteti serum/urinë",
    "albanianName": "Osmolaliteti i serumit dhe urinës",
    "englishName": "Serum and urine osmolality",
    "categoryId": "exam-laboratory",
    "category": "Laborator",
    "examGroup": "laboratory",
    "whatItShows": "Ndihmon në work-up të poliurisë/polidipsisë së pashpjeguar."
  },
  {
    "id": "exam-ecg",
    "formName": "EKG 12 derivacione",
    "albanianName": "Elektrokardiogram",
    "englishName": "12-lead ECG",
    "categoryId": "exam-cardio",
    "category": "EKG / funksionale",
    "examGroup": "cardio",
    "whatItShows": "Ritmin, frekuencën, përçimin dhe shenja të ishemisë ose hipertrofisë."
  },
  {
    "id": "exam-holter-ecg",
    "formName": "Holter EKG",
    "albanianName": "Monitorim ambulant i EKG-së",
    "englishName": "Ambulatory ECG monitoring",
    "categoryId": "exam-cardio",
    "category": "EKG / funksionale",
    "examGroup": "cardio",
    "whatItShows": "Kap aritmi intermitente që nuk dokumentohen në EKG-në e momentit."
  },
  {
    "id": "exam-echo",
    "formName": "Ehokardiografi",
    "albanianName": "Ultrazë e zemrës",
    "englishName": "Echocardiography",
    "categoryId": "exam-cardio",
    "category": "EKG / funksionale",
    "examGroup": "cardio",
    "whatItShows": "Strukturën dhe funksionin kardiak."
  },
  {
    "id": "exam-holter-bp",
    "formName": "Holter TA / ABPM",
    "albanianName": "Monitorim ambulant i tensionit",
    "englishName": "Ambulatory blood pressure monitoring",
    "categoryId": "exam-cardio",
    "category": "EKG / funksionale",
    "examGroup": "cardio",
    "whatItShows": "Profilin e tensionit gjatë 24 orëve."
  },
  {
    "id": "exam-spo2",
    "formName": "SpO₂",
    "albanianName": "Pulsoksimetria",
    "englishName": "Pulse oximetry",
    "categoryId": "exam-cardio",
    "category": "EKG / funksionale",
    "examGroup": "cardio",
    "whatItShows": "Oksigjenimin periferik."
  },
  {
    "id": "exam-spirometry",
    "formName": "Spirometri",
    "albanianName": "Spirometria",
    "englishName": "Spirometry",
    "categoryId": "exam-cardio",
    "category": "EKG / funksionale",
    "examGroup": "cardio",
    "whatItShows": "Obstruksion ose kufizim ventilator dhe përgjigje bronkodilatuese kur kryhet."
  },
  {
    "id": "exam-orthostatics",
    "formName": "TA ortostatike",
    "albanianName": "Tensioni dhe pulsi shtrirë/në këmbë",
    "englishName": "Orthostatic vital signs",
    "categoryId": "exam-cardio",
    "category": "EKG / funksionale",
    "examGroup": "cardio",
    "whatItShows": "Hipotension ortostatik ose përgjigje jonormale të pulsit me ngritje."
  },
  {
    "id": "exam-bmi-waist",
    "formName": "BMI + perimetri i belit",
    "albanianName": "Matje antropometrike",
    "englishName": "BMI and waist circumference",
    "categoryId": "exam-cardio",
    "category": "EKG / funksionale",
    "examGroup": "cardio",
    "whatItShows": "Adipozitetin total dhe qendror."
  },
  {
    "id": "exam-cxr",
    "formName": "RTG toraksi",
    "albanianName": "Rentgen i toraksit",
    "englishName": "Chest X-ray",
    "categoryId": "exam-imaging",
    "category": "RTG / CT / MRI",
    "examGroup": "imaging",
    "whatItShows": "Patologji pulmonare, pleurale dhe disa shenja kardiake."
  },
  {
    "id": "exam-abdominal-xray",
    "formName": "RTG abdomeni",
    "albanianName": "Rentgen i abdomenit",
    "englishName": "Abdominal X-ray",
    "categoryId": "exam-imaging",
    "category": "RTG / CT / MRI",
    "examGroup": "imaging",
    "whatItShows": "Ka rol të kufizuar; përdoret vetëm në indikacione të zgjedhura."
  },
  {
    "id": "exam-ct-chest",
    "formName": "CT toraksi",
    "albanianName": "Tomografi e toraksit",
    "englishName": "CT chest",
    "categoryId": "exam-imaging",
    "category": "RTG / CT / MRI",
    "examGroup": "imaging",
    "whatItShows": "Vlerësim i detajuar i parenkimës pulmonare, mediastinit dhe strukturave torakale."
  },
  {
    "id": "exam-ctpa",
    "formName": "CTPA",
    "albanianName": "CT angiografi pulmonare",
    "englishName": "CT pulmonary angiography",
    "categoryId": "exam-imaging",
    "category": "RTG / CT / MRI",
    "examGroup": "imaging",
    "whatItShows": "Imazheri për emboli pulmonare kur probabiliteti klinik dhe algoritmi e justifikojnë."
  },
  {
    "id": "exam-ct-abdomen",
    "formName": "CT abdomen/pelvis",
    "albanianName": "Tomografi e abdomenit dhe pelvisit",
    "englishName": "CT abdomen and pelvis",
    "categoryId": "exam-imaging",
    "category": "RTG / CT / MRI",
    "examGroup": "imaging",
    "whatItShows": "Patologji akute abdominale dhe retroperitoneale kur indikohet."
  },
  {
    "id": "exam-mri-brain",
    "formName": "MRI truri",
    "albanianName": "Rezonancë magnetike e trurit",
    "englishName": "Brain MRI",
    "categoryId": "exam-imaging",
    "category": "RTG / CT / MRI",
    "examGroup": "imaging",
    "whatItShows": "Patologji neurologjike strukturore; jo rutinë për marramendje pa red flags."
  },
  {
    "id": "exam-us-thyroid",
    "formName": "Ultrazë tiroide",
    "albanianName": "Ultrasonografi e tiroides",
    "englishName": "Thyroid ultrasound",
    "categoryId": "exam-ultrasound",
    "category": "Ultrazë",
    "examGroup": "ultrasound",
    "whatItShows": "Morfologjinë e tiroides, nodujt dhe karakteristikat që drejtojnë vlerësimin e mëtejshëm."
  },
  {
    "id": "exam-us-abdomen",
    "formName": "Ultrazë abdomeni",
    "albanianName": "Ultrasonografi abdominale",
    "englishName": "Abdominal ultrasound",
    "categoryId": "exam-ultrasound",
    "category": "Ultrazë",
    "examGroup": "ultrasound",
    "whatItShows": "Organe abdominale, hepatobiliar, veshka dhe lëng të lirë në indikacione të zgjedhura."
  },
  {
    "id": "exam-us-pelvis",
    "formName": "Ultrazë pelvise",
    "albanianName": "Ultrasonografi pelvike",
    "englishName": "Pelvic ultrasound",
    "categoryId": "exam-ultrasound",
    "category": "Ultrazë",
    "examGroup": "ultrasound",
    "whatItShows": "Struktura pelvike kur simptomat/gjetjet e justifikojnë."
  },
  {
    "id": "exam-venous-doppler",
    "formName": "Doppler venoz",
    "albanianName": "Ultrazë Doppler e venave",
    "englishName": "Venous Doppler ultrasound",
    "categoryId": "exam-ultrasound",
    "category": "Ultrazë",
    "examGroup": "ultrasound",
    "whatItShows": "DVT ose obstruksion venoz në edemë unilaterale të dyshimtë."
  },
  {
    "id": "exam-endoscopy",
    "formName": "Gastroskopi",
    "albanianName": "Endoskopi e sipërme GI",
    "englishName": "Upper GI endoscopy",
    "categoryId": "exam-other",
    "category": "Ekzaminime tjera",
    "examGroup": "other",
    "whatItShows": "Mukozën e traktit të sipërm gastrointestinal."
  },
  {
    "id": "exam-colonoscopy",
    "formName": "Kolonoskopi",
    "albanianName": "Kolonoskopi",
    "englishName": "Colonoscopy",
    "categoryId": "exam-other",
    "category": "Ekzaminime tjera",
    "examGroup": "other",
    "whatItShows": "Kolonin dhe lezione strukturore; përdoret sipas simptomave/riskut."
  },
  {
    "id": "exam-thyroid-fna",
    "formName": "FNA tiroide",
    "albanianName": "Aspirim me gjilpërë të hollë",
    "englishName": "Thyroid fine-needle aspiration",
    "categoryId": "exam-other",
    "category": "Ekzaminime tjera",
    "examGroup": "other",
    "whatItShows": "Citologji e nodujve tiroide të përzgjedhur sipas karakteristikave të ultrazërit."
  }
]);


  const CLINICAL_PRESENTATIONS = Object.freeze([
  {
    "id": "puls-i-rritur",
    "slug": "puls-i-rritur",
    "title": "Puls i rritur / takikardi",
    "clinicalType": "Shenjë",
    "aliases": [
      "takikardi",
      "puls i shpejte",
      "rrahje te shpejta"
    ],
    "summary": "Work-up për ritmin, shkaqet metabolike, aneminë dhe disfunksionin tiroide.",
    "tests": [
      {
        "testId": "exam-ecg",
        "tier": "core",
        "rationale": "Dokumento ritmin dhe shiko për aritmi, ishemi ose çrregullime të përçimit.",
        "contextNote": ""
      },
      {
        "testId": "exam-cbc",
        "tier": "core",
        "rationale": "Përjashto aneminë ose infeksionin si nxitës të takikardisë.",
        "contextNote": ""
      },
      {
        "testId": "exam-electrolytes",
        "tier": "core",
        "rationale": "Kërko çrregullime të K/Mg/Ca që mund të nxisin aritmi.",
        "contextNote": ""
      },
      {
        "testId": "exam-tsh",
        "tier": "core",
        "rationale": "Disfunksioni tiroide mund të shkaktojë takikardi.",
        "contextNote": ""
      },
      {
        "testId": "exam-glucose",
        "tier": "recommended",
        "rationale": "Hipoglikemia/hiperglikemia mund të shoqërohet me takikardi.",
        "contextNote": ""
      },
      {
        "testId": "exam-holter-ecg",
        "tier": "conditional",
        "rationale": "Nëse episodet janë intermitente dhe EKG e momentit nuk e kap ritmin.",
        "contextNote": ""
      },
      {
        "testId": "exam-troponin",
        "tier": "conditional",
        "rationale": "Vetëm nëse ka dhimbje gjoksi, ndryshime ishemike ose dyshim për ACS.",
        "contextNote": ""
      },
      {
        "testId": "exam-ddimer",
        "tier": "conditional",
        "rationale": "Vetëm kur dyshohet PE dhe probabiliteti klinik e bën testin të përshtatshëm.",
        "contextNote": ""
      },
      {
        "testId": "exam-echo",
        "tier": "conditional",
        "rationale": "Nëse ka murmur, HF, EKG jonormale ose dyshim për sëmundje strukturore.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Takikardi me hipotension, sinkopë, dhimbje gjoksi, dispne të rëndë ose shenja shoku → vlerësim urgjent."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 10
  },
  {
    "id": "puls-i-ngadalesuar",
    "slug": "puls-i-ngadalesuar",
    "title": "Puls i ngadalësuar / bradikardi",
    "clinicalType": "Shenjë",
    "aliases": [
      "bradikardi",
      "puls i ulet"
    ],
    "summary": "Vlerësim i ritmit, barnave, elektroliteve dhe shkaqeve metabolike.",
    "tests": [
      {
        "testId": "exam-ecg",
        "tier": "core",
        "rationale": "Dokumento ritmin dhe çrregullimet e përçimit.",
        "contextNote": ""
      },
      {
        "testId": "exam-electrolytes",
        "tier": "core",
        "rationale": "Kërko hiperkalemi dhe çrregullime tjera elektrolitike.",
        "contextNote": ""
      },
      {
        "testId": "exam-tsh",
        "tier": "recommended",
        "rationale": "Hipotiroidizmi mund të kontribuojë në bradikardi.",
        "contextNote": ""
      },
      {
        "testId": "exam-glucose",
        "tier": "recommended",
        "rationale": "Përjashto çrregullimet e glukozës në pacient simptomatik.",
        "contextNote": ""
      },
      {
        "testId": "exam-holter-ecg",
        "tier": "conditional",
        "rationale": "Në simptoma episodike ose dyshim për pauza/bradiaritmi intermitente.",
        "contextNote": ""
      },
      {
        "testId": "exam-echo",
        "tier": "conditional",
        "rationale": "Nëse ka dyshim për sëmundje strukturore.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Bradikardi me sinkopë, hipotension, dhimbje gjoksi, insuficiencë kardiake ose alterim të vetëdijes → urgjencë."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 20
  },
  {
    "id": "palpitacione",
    "slug": "palpitacione",
    "title": "Palpitacione",
    "clinicalType": "Simptomë",
    "aliases": [
      "rrahje zemre",
      "zemra me rreh",
      "palpitation"
    ],
    "summary": "Dokumentimi i ritmit ka përparësi ndaj trajtimit empirik.",
    "tests": [
      {
        "testId": "exam-ecg",
        "tier": "core",
        "rationale": "EKG 12 derivacione për ritmin bazal dhe shenja të përçimit/pre-ekscitimit.",
        "contextNote": ""
      },
      {
        "testId": "exam-cbc",
        "tier": "recommended",
        "rationale": "Anemia mund të japë palpitacione.",
        "contextNote": ""
      },
      {
        "testId": "exam-electrolytes",
        "tier": "recommended",
        "rationale": "Elektrolitet mund të predispozojnë për aritmi.",
        "contextNote": ""
      },
      {
        "testId": "exam-tsh",
        "tier": "recommended",
        "rationale": "Disfunksioni tiroide është shkak i mundshëm.",
        "contextNote": ""
      },
      {
        "testId": "exam-holter-ecg",
        "tier": "conditional",
        "rationale": "Kur episodet nuk dokumentohen në EKG; zgjidh kohëzgjatjen sipas frekuencës së episodeve.",
        "contextNote": ""
      },
      {
        "testId": "exam-echo",
        "tier": "conditional",
        "rationale": "Në EKG jonormale, murmur, sëmundje strukturore ose HF.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Palpitacione me sinkopë gjatë ushtrimit, dhimbje gjoksi, histori familjare të vdekjes së papritur ose ritëm të qëndrueshëm shumë të shpejtë → vlerësim urgjent/kardiologjik."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 30
  },
  {
    "id": "dhimbje-gjoksi",
    "slug": "dhimbje-gjoksi",
    "title": "Dhimbje gjoksi",
    "clinicalType": "Simptomë",
    "aliases": [
      "chest pain",
      "shtrengim gjoksi",
      "dhembje gjoksi"
    ],
    "summary": "Work-up fillestar për shkaqe kardiake dhe pulmonare; testet kushtëzohen nga probabiliteti klinik.",
    "tests": [
      {
        "testId": "exam-ecg",
        "tier": "urgent",
        "rationale": "EKG sa më shpejt kur dyshohet ACS ose aritmi.",
        "contextNote": ""
      },
      {
        "testId": "exam-troponin",
        "tier": "urgent",
        "rationale": "Kur tabloja sugjeron sindromë koronare akute; interpretohet me kohën dhe EKG-në.",
        "contextNote": ""
      },
      {
        "testId": "exam-spo2",
        "tier": "core",
        "rationale": "Vlerëson hipokseminë.",
        "contextNote": ""
      },
      {
        "testId": "exam-cxr",
        "tier": "conditional",
        "rationale": "Nëse dyshohet pneumoni, pneumotoraks, HF ose shkak tjetër torakal.",
        "contextNote": ""
      },
      {
        "testId": "exam-ddimer",
        "tier": "conditional",
        "rationale": "Vetëm kur vlerësimi klinik për PE e justifikon.",
        "contextNote": ""
      },
      {
        "testId": "exam-ctpa",
        "tier": "conditional",
        "rationale": "Kur algoritmi për PE e kërkon pas vlerësimit klinik/D-dimerit.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Dhimbje gjoksi me instabilitet hemodinamik, EKG ishemike, dispne të rëndë, sinkopë ose dyshim për diseksion/PE → urgjencë."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 40
  },
  {
    "id": "dispne",
    "slug": "dispne",
    "title": "Dispne / frymëmarrje e vështirësuar",
    "clinicalType": "Simptomë",
    "aliases": [
      "shortness of breath",
      "gulcim",
      "veshtiresi ne frymemarrje"
    ],
    "summary": "Work-up i orientuar drejt hipoksemisë, zemrës, mushkërive dhe anemisë.",
    "tests": [
      {
        "testId": "exam-spo2",
        "tier": "core",
        "rationale": "Vlerësim i menjëhershëm i oksigjenimit.",
        "contextNote": ""
      },
      {
        "testId": "exam-ecg",
        "tier": "core",
        "rationale": "Kërko aritmi, ishemi ose strain.",
        "contextNote": ""
      },
      {
        "testId": "exam-cbc",
        "tier": "core",
        "rationale": "Anemia ose leukocitoza mund të shpjegojnë/mbështesin shkakun.",
        "contextNote": ""
      },
      {
        "testId": "exam-cxr",
        "tier": "core",
        "rationale": "Imazheri fillestare në dispne të re ose të pashpjeguar sipas tablosë.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "conditional",
        "rationale": "Nëse dyshohet proces infektiv/inflamator.",
        "contextNote": ""
      },
      {
        "testId": "exam-bnp",
        "tier": "conditional",
        "rationale": "Nëse dyshohet insuficiencë kardiake.",
        "contextNote": ""
      },
      {
        "testId": "exam-echo",
        "tier": "conditional",
        "rationale": "Kur dyshohet problem strukturor/HF.",
        "contextNote": ""
      },
      {
        "testId": "exam-spirometry",
        "tier": "conditional",
        "rationale": "Për obstruksion kronik/asthmë pasi faza akute të jetë e përshtatshme për testim.",
        "contextNote": ""
      },
      {
        "testId": "exam-ddimer",
        "tier": "conditional",
        "rationale": "Vetëm sipas probabilitetit klinik për PE.",
        "contextNote": ""
      },
      {
        "testId": "exam-ctpa",
        "tier": "conditional",
        "rationale": "Kur work-up i PE e indikojnë.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "SpO₂ e ulët, lodhje respiratore, cianozë, hipotension, konfuzion ose dispne e papritur e rëndë → urgjencë."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 50
  },
  {
    "id": "kolle",
    "slug": "kolle",
    "title": "Kollë",
    "clinicalType": "Simptomë",
    "aliases": [
      "cough",
      "kolle e zgjatur",
      "kollitje"
    ],
    "summary": "Shumica e kollës akute nuk kërkon panel të gjerë; ekzaminimet varen nga kohëzgjatja dhe red flags.",
    "tests": [
      {
        "testId": "exam-spo2",
        "tier": "recommended",
        "rationale": "Në pacient të sëmurë, me dispne ose risk respirator.",
        "contextNote": ""
      },
      {
        "testId": "exam-cxr",
        "tier": "conditional",
        "rationale": "Në kollë persistente, red flags, pneumoni të dyshuar ose risk për patologji torakale.",
        "contextNote": ""
      },
      {
        "testId": "exam-cbc",
        "tier": "conditional",
        "rationale": "Kur ka ethe të rëndësishme ose sëmundje sistemike.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "conditional",
        "rationale": "Mund të ndihmojë në disa raste kur pas ekzaminimit mbetet paqartësi.",
        "contextNote": ""
      },
      {
        "testId": "exam-spirometry",
        "tier": "conditional",
        "rationale": "Në kollë kronike me dyshim për astmë/COPD.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Hemoptizi, hipoksemi, humbje peshe, dispne progresive ose gjendje e rënduar sistemike → vlerësim i përshpejtuar."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 60
  },
  {
    "id": "sinkope-marramendje",
    "slug": "sinkope-marramendje",
    "title": "Sinkopë / presinkopë / marramendje",
    "clinicalType": "Simptomë",
    "aliases": [
      "sinkope",
      "presinkope",
      "marramendje",
      "dizziness",
      "te fiket"
    ],
    "summary": "Dallo sinkopën nga vertigo dhe disequilibrium; ritmi dhe ortostatika janë pjesë kyçe.",
    "tests": [
      {
        "testId": "exam-ecg",
        "tier": "core",
        "rationale": "EKG bazale në sinkopë/presinkopë.",
        "contextNote": ""
      },
      {
        "testId": "exam-orthostatics",
        "tier": "core",
        "rationale": "Kërko hipotension ortostatik ose përgjigje jonormale të pulsit.",
        "contextNote": ""
      },
      {
        "testId": "exam-glucose",
        "tier": "core",
        "rationale": "Përjashto hipoglikeminë/hiperglikeminë.",
        "contextNote": ""
      },
      {
        "testId": "exam-cbc",
        "tier": "recommended",
        "rationale": "Anemia mund të kontribuojë.",
        "contextNote": ""
      },
      {
        "testId": "exam-electrolytes",
        "tier": "recommended",
        "rationale": "Çrregullimet elektrolitike mund të shkaktojnë simptoma/aritmi.",
        "contextNote": ""
      },
      {
        "testId": "exam-holter-ecg",
        "tier": "conditional",
        "rationale": "Në episode intermitente kur dyshohet aritmi.",
        "contextNote": ""
      },
      {
        "testId": "exam-echo",
        "tier": "conditional",
        "rationale": "Në murmur, EKG jonormale ose dyshim strukturor.",
        "contextNote": ""
      },
      {
        "testId": "exam-mri-brain",
        "tier": "conditional",
        "rationale": "Jo rutinë; vetëm me shenja neurologjike fokale ose indikacion neurologjik.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Sinkopë gjatë ushtrimit, EKG jonormale, dhimbje gjoksi, histori familjare vdekjeje të papritur ose deficit neurologjik → vlerësim urgjent."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 70
  },
  {
    "id": "humbje-peshe",
    "slug": "humbje-peshe",
    "title": "Humbje peshe pa arsye",
    "clinicalType": "Simptomë",
    "aliases": [
      "humbje ne peshe",
      "renie peshe",
      "unintentional weight loss"
    ],
    "summary": "Work-up bazë metabolik, hematologjik dhe sipas simptomave shoqëruese; mos porosit imazheri të gjerë pa drejtim klinik.",
    "tests": [
      {
        "testId": "exam-cbc",
        "tier": "core",
        "rationale": "Kërko anemi, leukocitozë/leukopeni ose çrregullime hematologjike.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "core",
        "rationale": "Marker orientues i inflamacionit.",
        "contextNote": ""
      },
      {
        "testId": "exam-esr",
        "tier": "recommended",
        "rationale": "Mund të plotësojë vlerësimin e proceseve kronike.",
        "contextNote": ""
      },
      {
        "testId": "exam-glucose",
        "tier": "core",
        "rationale": "Kërko diabet/hiperglikemi.",
        "contextNote": ""
      },
      {
        "testId": "exam-hba1c",
        "tier": "recommended",
        "rationale": "Vlerësim i glikemisë afatmesme.",
        "contextNote": ""
      },
      {
        "testId": "exam-tsh",
        "tier": "core",
        "rationale": "Disfunksioni tiroide mund të shkaktojë humbje peshe.",
        "contextNote": ""
      },
      {
        "testId": "exam-ft4",
        "tier": "conditional",
        "rationale": "Në TSH jonormal ose dyshim të fortë tiroide.",
        "contextNote": ""
      },
      {
        "testId": "exam-renal",
        "tier": "core",
        "rationale": "Funksioni renal dhe gjendja metabolike.",
        "contextNote": ""
      },
      {
        "testId": "exam-liver",
        "tier": "core",
        "rationale": "Vlerësim hepatik/metabolik.",
        "contextNote": ""
      },
      {
        "testId": "exam-urinalysis",
        "tier": "recommended",
        "rationale": "Gjetje renale, urinare ose glukozuri.",
        "contextNote": ""
      },
      {
        "testId": "exam-cxr",
        "tier": "conditional",
        "rationale": "Në risk/simptoma respiratore ose red flags të përshtatshme.",
        "contextNote": ""
      },
      {
        "testId": "exam-fit",
        "tier": "conditional",
        "rationale": "Sipas moshës dhe simptomave gastrointestinale/riskut.",
        "contextNote": ""
      },
      {
        "testId": "exam-us-abdomen",
        "tier": "conditional",
        "rationale": "Kur ekzaminimi/simptomat e orientojnë drejt abdomenit.",
        "contextNote": ""
      },
      {
        "testId": "exam-ct-abdomen",
        "tier": "conditional",
        "rationale": "Vetëm në red flags ose simptoma të orientuara që e justifikojnë.",
        "contextNote": ""
      },
      {
        "testId": "exam-endoscopy",
        "tier": "conditional",
        "rationale": "Në simptoma të sipërme GI/red flags sipas rrugës diagnostike.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Humbje peshe progresive me masë, adenopati, gjakderdhje, disfagi, ethe/natë djersitje ose ndryshim të habitit intestinal → hetim/referral i përshpejtuar."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 80
  },
  {
    "id": "shtim-peshe",
    "slug": "shtim-peshe",
    "title": "Shtim peshe",
    "clinicalType": "Simptomë",
    "aliases": [
      "rritje peshe",
      "weight gain",
      "shtim ne peshe"
    ],
    "summary": "Vlerëso adipositetin, faktorët metabolikë, tiroiden dhe barnat; jo çdo shtim peshe kërkon panel hormonal të gjerë.",
    "tests": [
      {
        "testId": "exam-bmi-waist",
        "tier": "core",
        "rationale": "Kuantifiko BMI dhe adipozitetin qendror.",
        "contextNote": ""
      },
      {
        "testId": "exam-tsh",
        "tier": "core",
        "rationale": "Kërko hipotiroidizëm kur ka dyshim klinik.",
        "contextNote": ""
      },
      {
        "testId": "exam-ft4",
        "tier": "conditional",
        "rationale": "Në TSH jonormal ose dyshim për problem hipofizar.",
        "contextNote": ""
      },
      {
        "testId": "exam-glucose",
        "tier": "core",
        "rationale": "Vlerësim metabolik.",
        "contextNote": ""
      },
      {
        "testId": "exam-hba1c",
        "tier": "recommended",
        "rationale": "Skrining/monitorim i disglikemisë.",
        "contextNote": ""
      },
      {
        "testId": "exam-liver",
        "tier": "recommended",
        "rationale": "Kërko dëmtim hepatik/metabolik sipas riskut.",
        "contextNote": ""
      },
      {
        "testId": "exam-renal",
        "tier": "recommended",
        "rationale": "Vlerësim renal veçanërisht në edemë/HTA.",
        "contextNote": ""
      },
      {
        "testId": "exam-pregnancy",
        "tier": "conditional",
        "rationale": "Kur shtatzënia është e mundshme dhe relevante.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Shtim peshe shumë i shpejtë me edemë, dispne ose oliguri → vlerëso volume overload dhe shkaqe kardiake/renale."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 90
  },
  {
    "id": "dhimbje-muskulare",
    "slug": "dhimbje-muskulare",
    "title": "Dhimbje muskulare / mialgji",
    "clinicalType": "Simptomë",
    "aliases": [
      "mialgji",
      "dhimbje ne muskuj",
      "dhimbje muskulare"
    ],
    "summary": "Kërko dëmtim muskular dhe shkaqe metabolike; mos porosit panel autoimun pa gjetje që e justifikojnë.",
    "tests": [
      {
        "testId": "exam-ck",
        "tier": "core",
        "rationale": "Vlerëson dëmtimin muskular kur mialgjia është e rëndësishme ose ka dobësi.",
        "contextNote": ""
      },
      {
        "testId": "exam-renal",
        "tier": "core",
        "rationale": "Rëndësi e veçantë në CK të lartë/dehidrim ose dyshim për rhabdomyolysis.",
        "contextNote": ""
      },
      {
        "testId": "exam-electrolytes",
        "tier": "core",
        "rationale": "K/Mg/Ca mund të lidhen me simptoma muskulare.",
        "contextNote": ""
      },
      {
        "testId": "exam-tsh",
        "tier": "recommended",
        "rationale": "Disfunksioni tiroide mund të japë mialgji.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "conditional",
        "rationale": "Kur ka dyshim për proces inflamator/sistemik.",
        "contextNote": ""
      },
      {
        "testId": "exam-esr",
        "tier": "conditional",
        "rationale": "Në simptoma kronike/inflamatore të zgjedhura.",
        "contextNote": ""
      },
      {
        "testId": "exam-urinalysis",
        "tier": "conditional",
        "rationale": "Në urinë të errët ose dyshim për rhabdomyolysis.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Dobësi e rëndë, urinë e errët, CK shumë e lartë, hiperkalemi ose dëmtim renal → vlerësim urgjent."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 100
  },
  {
    "id": "dobesi-muskulare",
    "slug": "dobesi-muskulare",
    "title": "Dobësi muskulare",
    "clinicalType": "Shenjë",
    "aliases": [
      "dobesi e muskujve",
      "muscle weakness"
    ],
    "summary": "Dallo dobësinë objektive nga lodhja; work-up bazë metabolik, muskular dhe neurologjik.",
    "tests": [
      {
        "testId": "exam-ck",
        "tier": "core",
        "rationale": "Kërko dëmtim/miozit.",
        "contextNote": ""
      },
      {
        "testId": "exam-electrolytes",
        "tier": "core",
        "rationale": "Çrregullimet e K/Ca/Mg mund të japin dobësi.",
        "contextNote": ""
      },
      {
        "testId": "exam-tsh",
        "tier": "core",
        "rationale": "Disfunksioni tiroide mund të shkaktojë dobësi.",
        "contextNote": ""
      },
      {
        "testId": "exam-cbc",
        "tier": "recommended",
        "rationale": "Anemia/sëmundja sistemike mund të kontribuojë.",
        "contextNote": ""
      },
      {
        "testId": "exam-renal",
        "tier": "recommended",
        "rationale": "Uremia dhe çrregullimet metabolike mund të kontribuojnë.",
        "contextNote": ""
      },
      {
        "testId": "exam-glucose",
        "tier": "recommended",
        "rationale": "Hipo/hiperglikemia mund të japë dobësi.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "conditional",
        "rationale": "Kur ka shenja inflamatore.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Dobësi akute fokale, bulbare, respiratore ose progresion i shpejtë → urgjencë neurologjike."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 110
  },
  {
    "id": "gushe-tiroide",
    "slug": "gushe-tiroide",
    "title": "Gushë e rritur / tiroide e zmadhuar",
    "clinicalType": "Gjetje",
    "aliases": [
      "gushe",
      "tiroide e zmadhuar",
      "goiter",
      "goitre",
      "nodul tiroide"
    ],
    "summary": "Vlerësimi fillon me funksionin tiroide dhe karakteristikat klinike; ultrazëri varet nga nodulariteti/dyshimi.",
    "tests": [
      {
        "testId": "exam-tsh",
        "tier": "core",
        "rationale": "Test fillestar për funksionin tiroide.",
        "contextNote": ""
      },
      {
        "testId": "exam-ft4",
        "tier": "conditional",
        "rationale": "Në TSH të lartë/ulët ose dyshim për disfunksion qendror.",
        "contextNote": ""
      },
      {
        "testId": "exam-ft3",
        "tier": "conditional",
        "rationale": "Në TSH të ulët për të karakterizuar thyrotoxicosis.",
        "contextNote": ""
      },
      {
        "testId": "exam-us-thyroid",
        "tier": "recommended",
        "rationale": "Për zmadhim/nodul të palpueshëm kur duhet karakterizim strukturor ose ka dyshim për malignitet.",
        "contextNote": ""
      },
      {
        "testId": "exam-thyroid-fna",
        "tier": "conditional",
        "rationale": "Vetëm për noduj të përzgjedhur sipas karakteristikave të ultrazërit.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Rritje e shpejtë e masës, disfagi, dispne, zë i ngjirur ose adenopati cervikale → vlerësim i përshpejtuar."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 120
  },
  {
    "id": "bark-rigid",
    "slug": "bark-rigid",
    "title": "Bark rigid / peritonizëm",
    "clinicalType": "Gjetje",
    "aliases": [
      "bark i forte",
      "bark rigid",
      "abdomen rigid",
      "peritonizem"
    ],
    "summary": "Gjetje potencialisht kirurgjikale; ekzaminimet nuk duhet ta vonojnë referimin urgjent.",
    "tests": [
      {
        "testId": "exam-cbc",
        "tier": "urgent",
        "rationale": "Kërko leukocitozë/anemi, por mos e vono konsultën kirurgjikale.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "urgent",
        "rationale": "Vlerësim inflamator në kontekst të abdomenit akut.",
        "contextNote": ""
      },
      {
        "testId": "exam-electrolytes",
        "tier": "urgent",
        "rationale": "Çrregullime nga të vjellat/dehidrimi dhe përgatitje për trajtim.",
        "contextNote": ""
      },
      {
        "testId": "exam-renal",
        "tier": "urgent",
        "rationale": "Funksioni renal dhe statusi i volumit, veçanërisht para kontrastit kur indikohet.",
        "contextNote": ""
      },
      {
        "testId": "exam-liver",
        "tier": "urgent",
        "rationale": "Në dhimbje hepatobiliare/verdhezë ose si pjesë e work-up të abdomenit akut.",
        "contextNote": ""
      },
      {
        "testId": "exam-lipase",
        "tier": "urgent",
        "rationale": "Në dhimbje epigastrike ose dyshim për pankreatit.",
        "contextNote": ""
      },
      {
        "testId": "exam-lactate",
        "tier": "urgent",
        "rationale": "Në kompromis sistemik, hipoperfuzion ose dyshim për ishemi/sepsë.",
        "contextNote": ""
      },
      {
        "testId": "exam-pregnancy",
        "tier": "urgent",
        "rationale": "Kur shtatzënia është biologjikisht e mundshme.",
        "contextNote": ""
      },
      {
        "testId": "exam-urinalysis",
        "tier": "recommended",
        "rationale": "Ndihmon në diferencimin urinar/renal.",
        "contextNote": ""
      },
      {
        "testId": "exam-us-abdomen",
        "tier": "conditional",
        "rationale": "Në hepatobiliar, aneurizëm ose patologji të orientuar ku US është i përshtatshëm.",
        "contextNote": ""
      },
      {
        "testId": "exam-ct-abdomen",
        "tier": "urgent",
        "rationale": "Imazheri definitive në shumë tablo të abdomenit akut kur pacienti është stabil dhe indikacioni është i qartë.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Bark rigid/peritonizëm = red flag kirurgjikal. Mos prit që ekzaminimet të përfundojnë para referimit/assessment-it urgjent."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 130
  },
  {
    "id": "dhimbje-abdominale",
    "slug": "dhimbje-abdominale",
    "title": "Dhimbje abdominale",
    "clinicalType": "Simptomë",
    "aliases": [
      "dhembje barku",
      "abdominal pain",
      "dhimbje barku"
    ],
    "summary": "Work-up drejtohet nga lokalizimi, mosha, shtatzënia dhe ekzaminimi fizik.",
    "tests": [
      {
        "testId": "exam-cbc",
        "tier": "recommended",
        "rationale": "Anemi/leukocitozë sipas tablosë.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "recommended",
        "rationale": "Marker inflamator jo-specifik.",
        "contextNote": ""
      },
      {
        "testId": "exam-urinalysis",
        "tier": "core",
        "rationale": "Kërko UTI, hematuri, ketone ose gjetje të tjera.",
        "contextNote": ""
      },
      {
        "testId": "exam-pregnancy",
        "tier": "core",
        "rationale": "Kur shtatzënia është e mundshme.",
        "contextNote": ""
      },
      {
        "testId": "exam-lipase",
        "tier": "conditional",
        "rationale": "Në dhimbje epigastrike/pankreatit të dyshuar.",
        "contextNote": ""
      },
      {
        "testId": "exam-liver",
        "tier": "conditional",
        "rationale": "Në RUQ/verdhezë ose dyshim hepatobiliar.",
        "contextNote": ""
      },
      {
        "testId": "exam-us-abdomen",
        "tier": "conditional",
        "rationale": "Sipas lokalizimit dhe dyshimit klinik.",
        "contextNote": ""
      },
      {
        "testId": "exam-us-pelvis",
        "tier": "conditional",
        "rationale": "Në simptoma pelvike/gjinekologjike.",
        "contextNote": ""
      },
      {
        "testId": "exam-ct-abdomen",
        "tier": "conditional",
        "rationale": "Në red flags, tablo të paqartë ose dyshim për patologji që kërkon CT.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Peritonizëm, hipotension, gjakderdhje GI, dhimbje disproporcionale, shtatzëni ektopike e dyshuar ose aneurizëm → urgjencë."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 140
  },
  {
    "id": "vjellje",
    "slug": "vjellje",
    "title": "Të vjella",
    "clinicalType": "Simptomë",
    "aliases": [
      "vjellje",
      "te vjella",
      "vomiting",
      "nauze"
    ],
    "summary": "Shumica e rasteve të lehta nuk kërkon panel të gjerë; kërko shkaqet dhe dehidrimin.",
    "tests": [
      {
        "testId": "exam-electrolytes",
        "tier": "core",
        "rationale": "Vlerëso humbjet e Na/K dhe çrregullime metabolike në të vjella të konsiderueshme.",
        "contextNote": ""
      },
      {
        "testId": "exam-renal",
        "tier": "core",
        "rationale": "Vlerëso dehidrimin dhe funksionin renal.",
        "contextNote": ""
      },
      {
        "testId": "exam-glucose",
        "tier": "core",
        "rationale": "Hipo/hiperglikemia dhe DKA mund të paraqiten me të vjella.",
        "contextNote": ""
      },
      {
        "testId": "exam-pregnancy",
        "tier": "core",
        "rationale": "Kur shtatzënia është e mundshme.",
        "contextNote": ""
      },
      {
        "testId": "exam-cbc",
        "tier": "conditional",
        "rationale": "Në ethe, gjakderdhje ose sëmundje sistemike.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "conditional",
        "rationale": "Kur dyshohet proces inflamator/infektiv.",
        "contextNote": ""
      },
      {
        "testId": "exam-liver",
        "tier": "conditional",
        "rationale": "Në verdhezë/RUQ ose dyshim hepatobiliar.",
        "contextNote": ""
      },
      {
        "testId": "exam-lipase",
        "tier": "conditional",
        "rationale": "Në dhimbje epigastrike/pankreatit.",
        "contextNote": ""
      },
      {
        "testId": "exam-vbg-ketones",
        "tier": "conditional",
        "rationale": "Kur dyshohet DKA, acidozë ose dekompensim metabolik.",
        "contextNote": ""
      },
      {
        "testId": "exam-ct-abdomen",
        "tier": "conditional",
        "rationale": "Vetëm kur ekzaminimi sugjeron obstruksion/abdomen akut ose patologji strukturore.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Pamundësi për lëngje, hipotension, oliguri, hematemezë, alterim të vetëdijes ose abdomen akut → vlerësim urgjent."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 150
  },
  {
    "id": "diarre",
    "slug": "diarre",
    "title": "Diarre",
    "clinicalType": "Simptomë",
    "aliases": [
      "diarrhea",
      "barkqitje",
      "jashteqitje te ujshme"
    ],
    "summary": "Në diarre akute të lehtë pa dehidrim/red flags nuk nevojitet panel rutinë i gjerë.",
    "tests": [
      {
        "testId": "exam-electrolytes",
        "tier": "conditional",
        "rationale": "Në dehidrim, sëmundje të rëndë, moshë/risk të lartë ose nevojë për IV fluid.",
        "contextNote": ""
      },
      {
        "testId": "exam-renal",
        "tier": "conditional",
        "rationale": "Në dehidrim, oliguri ose risk renal.",
        "contextNote": ""
      },
      {
        "testId": "exam-cbc",
        "tier": "conditional",
        "rationale": "Në gjak në feçe, ethe të lartë ose sëmundje sistemike.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "conditional",
        "rationale": "Në sëmundje inflamatore/infektive më të rëndë.",
        "contextNote": ""
      },
      {
        "testId": "exam-stool",
        "tier": "conditional",
        "rationale": "Në gjak/mukus, imunosupresion, udhëtim, outbreak, persistencë ose diagnozë të pasigurt.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Dehidrim i rëndë/shok, gjakderdhje e konsiderueshme, alterim të vetëdijes ose abdomen akut → urgjencë."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 160
  },
  {
    "id": "edeme",
    "slug": "edeme",
    "title": "Edemë e këmbëve / edemë periferike",
    "clinicalType": "Shenjë",
    "aliases": [
      "edeme",
      "kembe te enjtura",
      "swelling legs"
    ],
    "summary": "Dallo edemën unilaterale nga bilaterale dhe vlerëso zemrën, veshkat, mëlçinë dhe venat.",
    "tests": [
      {
        "testId": "exam-renal",
        "tier": "core",
        "rationale": "Funksion renal dhe status volumor.",
        "contextNote": ""
      },
      {
        "testId": "exam-electrolytes",
        "tier": "core",
        "rationale": "Elektrolite para/gjatë trajtimit dhe në dyshim renal/HF.",
        "contextNote": ""
      },
      {
        "testId": "exam-liver",
        "tier": "recommended",
        "rationale": "Hipoalbuminemi/hepatopati mund të kontribuojnë.",
        "contextNote": ""
      },
      {
        "testId": "exam-urinalysis",
        "tier": "recommended",
        "rationale": "Proteinuri/hematuri dhe shenja të dëmtimit renal.",
        "contextNote": ""
      },
      {
        "testId": "exam-acr",
        "tier": "conditional",
        "rationale": "Në dyshim për albuminuri/CKD.",
        "contextNote": ""
      },
      {
        "testId": "exam-ecg",
        "tier": "recommended",
        "rationale": "Në dyshim kardiak.",
        "contextNote": ""
      },
      {
        "testId": "exam-bnp",
        "tier": "conditional",
        "rationale": "Në dispne/kongjestion me dyshim për HF.",
        "contextNote": ""
      },
      {
        "testId": "exam-echo",
        "tier": "conditional",
        "rationale": "Në shenja të HF ose problem strukturor.",
        "contextNote": ""
      },
      {
        "testId": "exam-venous-doppler",
        "tier": "conditional",
        "rationale": "Në edemë akute unilaterale me dyshim për DVT.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Edemë unilaterale akute me dhimbje, dispne e re, hipoksemi ose dhimbje gjoksi → vlerësim urgjent për VTE."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 170
  },
  {
    "id": "poliuri-polidipsi",
    "slug": "poliuri-polidipsi",
    "title": "Urinim i shpeshtë / etje e shtuar",
    "clinicalType": "Simptomë",
    "aliases": [
      "poliuri",
      "polidipsi",
      "etje",
      "urinim i shpeshte"
    ],
    "summary": "Fillimisht përjashto diabetin dhe çrregullimet renale/elektrolitike.",
    "tests": [
      {
        "testId": "exam-glucose",
        "tier": "core",
        "rationale": "Kërko hiperglikemi.",
        "contextNote": ""
      },
      {
        "testId": "exam-hba1c",
        "tier": "core",
        "rationale": "Vlerëso glikeminë afatmesme kur është e përshtatshme.",
        "contextNote": ""
      },
      {
        "testId": "exam-urinalysis",
        "tier": "core",
        "rationale": "Glukozuri, ketonuri dhe gjetje urinare.",
        "contextNote": ""
      },
      {
        "testId": "exam-electrolytes",
        "tier": "recommended",
        "rationale": "Na/K/Ca mund të ndihmojnë në shkaqe metabolike.",
        "contextNote": ""
      },
      {
        "testId": "exam-renal",
        "tier": "recommended",
        "rationale": "Funksion renal dhe status hidratimi.",
        "contextNote": ""
      },
      {
        "testId": "exam-osmolality",
        "tier": "conditional",
        "rationale": "Në poliuri të vërtetë të pashpjeguar pas work-up fillestar.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Hiperglikemi me ketone, të vjella, frymëmarrje të thellë, dehidrim ose alterim të vetëdijes → DKA/HHS pathway urgjent."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 180
  },
  {
    "id": "temperature",
    "slug": "temperature",
    "title": "Temperaturë / ethe",
    "clinicalType": "Shenjë",
    "aliases": [
      "ethe",
      "fever",
      "temperature e larte"
    ],
    "summary": "Mos porosit panel të njëjtë për çdo ethe; ekzaminimet orientohen nga fokusi dhe gjendja sistemike.",
    "tests": [
      {
        "testId": "exam-cbc",
        "tier": "recommended",
        "rationale": "Në sëmundje sistemike, ethe persistente ose dyshim bakterial.",
        "contextNote": ""
      },
      {
        "testId": "exam-crp",
        "tier": "recommended",
        "rationale": "Mund të ndihmojë në monitorim/diferencim së bashku me klinikën.",
        "contextNote": ""
      },
      {
        "testId": "exam-urinalysis",
        "tier": "conditional",
        "rationale": "Kur ka simptoma urinare ose nuk ka fokus të qartë sipas riskut.",
        "contextNote": ""
      },
      {
        "testId": "exam-cxr",
        "tier": "conditional",
        "rationale": "Kur ka simptoma respiratore/dispne ose auskultim jonormal.",
        "contextNote": ""
      },
      {
        "testId": "exam-lactate",
        "tier": "urgent",
        "rationale": "Në hipotension, hipoperfuzion ose dyshim për sepsë.",
        "contextNote": ""
      }
    ],
    "redFlags": [
      "Hipotension, konfuzion, takipne, hipoksemi, rash purpurik ose shenja hipoperfuzioni → sepsis/emergency pathway."
    ],
    "titleEn": "",
    "icdCodes": [],
    "catalogGaps": [],
    "sortOrder": 190
  }
]);

  const state = {
    data:null,
    testsById:new Map(),
    categoriesById:new Map(),
    indicationsById:new Map(),
    selectedIndicationIds:new Set(),
    manualTestIds:new Set(),
    excludedTestIds:new Set(),
    diseaseTerm:'',
    manualTerm:'',
    examFilter:'all',
    searchTimer:0,
  };

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  async function authJson(url = '/api/auth', options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin',
        cache:'no-store',
        ...options,
        signal:controller.signal,
        headers:{ Accept:'application/json', ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally {
      clearTimeout(timer);
    }
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { response, payload } = await authJson();
    const signedOut = response.status === 401
      || response.status === 403
      || (response.ok && payload.authenticated === false);

    if (signedOut) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if (!response.ok) throw new Error('Sesioni nuk mund të verifikohet për momentin.');
    if (payload.authenticated !== true) throw new Error('Gjendja e sesionit nuk u konfirmua.');
    return payload;
  }

  function loadRuntime(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) {
      return new Promise(resolve => {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once:true });
        setTimeout(resolve, 1800);
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute(marker, '1');
      script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve();
      }, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  async function syncProfileChrome(payload) {
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v7', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    void loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v4', 'data-drx-sidebar-taxonomy');
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = false;
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = true;
  }

  async function logout() {
    const button = $('#logoutButton');
    if (button) button.disabled = true;
    try {
      const { response } = await authJson('/api/auth', { method:'DELETE' });
      if (!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    } catch {
      if (button) button.disabled = false;
    }
  }

  function bindShell() {
    $('#menuButton')?.addEventListener('click', openSidebar);
    $('#sidebarClose')?.addEventListener('click', closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('#logoutButton')?.addEventListener('click', logout);

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!$('#labDiseasePopover')?.hidden) {
          closeDiseasePicker();
          return;
        }
        if (!$('#labManualResults')?.hidden) {
          hideManualResults();
          return;
        }
        closeSidebar();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#labManualSearch')?.focus();
      }
    });
  }

  async function loadDataset() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch('/api/icd?dataset=labs', {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
        signal:controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `API ${response.status}`);
      const data = payload?.data;
      if (!data || !Array.isArray(data.tests) || !Array.isArray(data.categories)) {
        throw new Error('Dataset-i laboratorik nuk është i plotë.');
      }
      if (!data.tests.length || !data.categories.length) throw new Error('Katalogu laboratorik është bosh.');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function buildClinicalDataset(data) {
    const categoryIds = new Set((data.categories || []).map(item => item.id));
    const testIds = new Set((data.tests || []).map(item => item.id));
    const categories = [
      ...(data.categories || []),
      ...EXAM_CATEGORIES.filter(item => !categoryIds.has(item.id)),
    ];
    const tests = [
      ...(data.tests || []).map(test => ({ ...test, examGroup:test.examGroup || 'laboratory' })),
      ...EXAM_CATALOG.filter(item => !testIds.has(item.id)),
    ];
    return {
      ...data,
      categories,
      tests,
      indications:CLINICAL_PRESENTATIONS.map(item => ({
        ...item,
        tests:(item.tests || []).filter(link => tests.some(test => test.id === link.testId)),
      })),
      source:`${data.source || 'Supabase'} + DRx clinical work-up`,
    };
  }

  function installDataset(data) {
    data = buildClinicalDataset(data);
    state.data = data;
    state.testsById = new Map(data.tests.map(test => [test.id, test]));
    state.categoriesById = new Map(data.categories.map(category => [category.id, category]));
    state.indicationsById = new Map(data.indications.map(indication => [indication.id, indication]));

    $('#labTestTotal').textContent = String(data.tests.length);
    $('#labIndicationTotal').textContent = String(data.indications.length);
    $('#syncText').textContent = 'Aktiv';
    $('#sourceStatus').textContent = `${data.source || 'Supabase + DRx'} · ${data.tests.length} ekzaminime · ${data.indications.length} prezantime klinike`;

    restoreUrl();
    renderAll();
  }

  function selectedIndications() {
    return [...state.selectedIndicationIds]
      .map(id => state.indicationsById.get(id))
      .filter(Boolean)
      .sort((a, b) => (Number(a.sortOrder) || 100) - (Number(b.sortOrder) || 100));
  }

  function diseaseSearchText(indication) {
    return normalize([
      indication.title,
      indication.titleEn,
      indication.clinicalType,
      ...(indication.aliases || []),
      indication.summary,
    ].join(' '));
  }

  function testSearchText(test) {
    return normalize([
      test.formName,
      test.albanianName,
      test.englishName,
      test.category,
      test.whatItShows,
      test.examGroup,
    ].join(' '));
  }

  function tierOf(current, incoming) {
    if (!current) return incoming || 'recommended';
    const a = TIER_ORDER[current] ?? 99;
    const b = TIER_ORDER[incoming] ?? 99;
    return b < a ? incoming : current;
  }

  function buildPlanEntries() {
    const map = new Map();

    for (const indication of selectedIndications()) {
      for (const link of indication.tests || []) {
        const test = state.testsById.get(link.testId);
        if (!test) continue;
        if (!map.has(test.id)) {
          map.set(test.id, { test, tier:link.tier || 'recommended', reasons:[], manual:false });
        }
        const entry = map.get(test.id);
        entry.tier = tierOf(entry.tier, link.tier || 'recommended');
        if (!entry.reasons.some(reason => reason.indicationId === indication.id)) {
          entry.reasons.push({
            indicationId:indication.id,
            presentation:indication.title,
            clinicalType:indication.clinicalType || 'Prezantim klinik',
            rationale:link.rationale || '',
            contextNote:link.contextNote || '',
          });
        }
      }
    }

    for (const testId of state.manualTestIds) {
      const test = state.testsById.get(testId);
      if (!test) continue;
      if (!map.has(testId)) map.set(testId, { test, tier:'manual', reasons:[], manual:true });
      else map.get(testId).manual = true;
    }

    return [...map.values()].sort((a, b) => {
      const tierDiff = (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99);
      if (tierDiff) return tierDiff;
      return clean(a.test.formName).localeCompare(clean(b.test.formName), 'sq');
    });
  }

  function syncUrl() {
    try {
      const url = new URL(window.location.href);
      const slugs = selectedIndications().map(item => item.slug).filter(Boolean);
      if (slugs.length) url.searchParams.set('sx', slugs.join(','));
      else url.searchParams.delete('sx');
      url.searchParams.delete('dx');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  function restoreUrl() {
    try {
      const url = new URL(window.location.href);
      const slugs = (url.searchParams.get('sx') || url.searchParams.get('dx') || '').split(',').map(clean).filter(Boolean);
      const bySlug = new Map((state.data?.indications || []).map(item => [item.slug, item.id]));
      slugs.forEach(slug => {
        const id = bySlug.get(slug);
        if (id) state.selectedIndicationIds.add(id);
      });
    } catch {}
  }

  function openDiseasePicker() {
    const popover = $('#labDiseasePopover');
    const trigger = $('#labDiseaseTrigger');
    if (!popover || !trigger) return;
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    renderDiseaseList();
    requestAnimationFrame(() => $('#labDiseaseSearch')?.focus());
  }

  function closeDiseasePicker() {
    const popover = $('#labDiseasePopover');
    const trigger = $('#labDiseaseTrigger');
    if (popover) popover.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    state.diseaseTerm = '';
    if ($('#labDiseaseSearch')) $('#labDiseaseSearch').value = '';
  }

  function toggleDiseasePicker() {
    if ($('#labDiseasePopover')?.hidden) openDiseasePicker();
    else closeDiseasePicker();
  }

  function diseaseOptionMarkup(indication) {
    const selected = state.selectedIndicationIds.has(indication.id);
    return `
      <button type="button" class="lab-disease-option${selected ? ' is-selected' : ''}" data-disease-id="${esc(indication.id)}" role="option" aria-selected="${selected}">
        <span class="lab-disease-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg>
        </span>
        <span class="lab-disease-copy">
          <strong>${esc(indication.title)}</strong>
          <small>${esc(indication.summary || indication.titleEn || '')}</small>
        </span>
        <span class="lab-disease-icd"><span>${esc(indication.clinicalType || 'Klinike')}</span><small>${(indication.tests || []).length} ekzaminime</small></span>
      </button>`;
  }

  function renderDiseaseList() {
    const root = $('#labDiseaseList');
    if (!root || !state.data) return;
    const term = normalize(state.diseaseTerm);
    const rows = state.data.indications.filter(indication => !term || diseaseSearchText(indication).includes(term));
    root.innerHTML = rows.length
      ? rows.map(diseaseOptionMarkup).join('')
      : '<div class="lab-picker-empty">Nuk u gjet shenjë ose simptomë.</div>';
  }

  function renderSelectedDiseases() {
    const root = $('#labSelectedDiseases');
    const summary = $('#labSummaryDiseases');
    const triggerText = $('#labDiseaseTriggerText');
    const indications = selectedIndications();

    if (triggerText) {
      triggerText.textContent = indications.length === 0
        ? 'Zgjidh shenja ose simptoma…'
        : indications.length === 1
          ? indications[0].title
          : `${indications.length} prezantime të zgjedhura`;
    }

    if (root) {
      root.innerHTML = indications.length
        ? indications.map(indication => `
          <span class="lab-disease-chip">
            <span>${esc(indication.title)}</span>
            <small>${esc(indication.clinicalType || 'Prezantim klinik')}</small>
            <button type="button" data-remove-disease="${esc(indication.id)}" aria-label="Hiq ${esc(indication.title)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7l10 10M17 7 7 17"/></svg>
            </button>
          </span>`).join('')
        : '<span class="lab-selected-empty">Nuk ke zgjedhur ende shenjë ose simptomë.</span>';
    }

    if (summary) {
      summary.innerHTML = indications.length
        ? indications.map(indication => `
          <div class="lab-summary-dx-item">
            <strong>${esc(indication.title)}</strong>
            <span>${esc(indication.clinicalType || 'Prezantim klinik')}</span>
          </div>`).join('')
        : '<span>—</span>';
    }

    $('#labDiagnosisCount').textContent = String(indications.length);
  }

  function pruneExcludedTests() {
    const activeIds = new Set(buildPlanEntries().map(entry => entry.test.id));
    for (const id of [...state.excludedTestIds]) {
      if (!activeIds.has(id)) state.excludedTestIds.delete(id);
    }
  }

  function toggleIndication(id) {
    if (!state.indicationsById.has(id)) return;
    if (state.selectedIndicationIds.has(id)) state.selectedIndicationIds.delete(id);
    else state.selectedIndicationIds.add(id);

    pruneExcludedTests();
    renderDiseaseList();
    renderSelectedDiseases();
    renderPlan();
    renderGaps();
    renderManualResults();
    syncUrl();
  }

  function removeIndication(id) {
    state.selectedIndicationIds.delete(id);
    pruneExcludedTests();
    renderDiseaseList();
    renderSelectedDiseases();
    renderPlan();
    renderGaps();
    renderManualResults();
    syncUrl();
  }

  function manualSearchResults() {
    const term = normalize(state.manualTerm);
    if (!term || !state.data) return [];
    const planned = buildPlanEntries();
    const existingIds = new Set(planned.map(entry => entry.test.id));
    const existingNames = new Set(planned.map(entry => normalize(entry.test.formName)));
    const seenNames = new Set();

    return state.data.tests
      .filter(test => {
        const name = normalize(test.formName);
        if (existingIds.has(test.id) || existingNames.has(name)) return false;
        if (!testSearchText(test).includes(term) || seenNames.has(name)) return false;
        seenNames.add(name);
        return true;
      })
      .slice(0, 10);
  }
  function hideManualResults() {
    const root = $('#labManualResults');
    if (root) root.hidden = true;
  }

  function renderManualResults() {
    const root = $('#labManualResults');
    if (!root) return;
    const results = manualSearchResults();

    if (!clean(state.manualTerm)) {
      root.hidden = true;
      root.innerHTML = '';
      return;
    }

    root.hidden = false;
    root.innerHTML = results.length
      ? results.map(test => `
        <button type="button" class="lab-manual-option" data-add-test="${esc(test.id)}" role="option">
          <span>
            <strong>${esc(test.formName)}</strong>
            <small>${esc(test.albanianName || test.englishName || test.category || '')}</small>
          </span>
          <em>Shto +</em>
        </button>`).join('')
      : '<div class="lab-picker-empty">Nuk u gjet ekzaminim tjetër.</div>';
  }

  function addManualTest(id) {
    if (!state.testsById.has(id)) return;
    state.manualTestIds.add(id);
    state.excludedTestIds.delete(id);
    state.manualTerm = '';
    if ($('#labManualSearch')) $('#labManualSearch').value = '';
    hideManualResults();
    renderPlan();
    renderManualResults();
  }

  function removeManualTest(id) {
    state.manualTestIds.delete(id);
    state.excludedTestIds.delete(id);
    pruneExcludedTests();
    renderPlan();
    renderManualResults();
  }

  function tierSectionMarkup(tier, entries) {
    if (!entries.length) return '';
    const meta = TIER_META[tier] || TIER_META.recommended;
    return `
      <section class="lab-tier-section" data-tier="${esc(tier)}">
        <header class="lab-tier-head">
          <div class="lab-tier-title">
            <span class="lab-tier-marker" aria-hidden="true"></span>
            <strong>${esc(meta.label)}</strong>
            <small>${esc(meta.description)}</small>
          </div>
          <span>${entries.length} ekzaminime</span>
        </header>
        <div class="lab-test-list">
          ${entries.map(testRowMarkup).join('')}
        </div>
      </section>`;
  }

  function testRowMarkup(entry) {
    const test = entry.test;
    const selected = !state.excludedTestIds.has(test.id);
    const category = state.categoriesById.get(test.categoryId);
    const detailLines = [
      test.whatItShows ? `<p><strong>Çfarë vlerëson:</strong> ${esc(test.whatItShows)}</p>` : '',
      test.highPositiveAbnormal ? `<p><strong>Kur rritet / jonormale:</strong> ${esc(test.highPositiveAbnormal)}</p>` : '',
      test.lowNegativeNormal ? `<p><strong>Kur ulet / normale:</strong> ${esc(test.lowNegativeNormal)}</p>` : '',
    ].filter(Boolean).join('');

    return `
      <article class="lab-test-row" data-test-id="${esc(test.id)}" data-exam-group="${esc(test.examGroup || 'laboratory')}">
        <label class="lab-test-toggle" aria-label="${selected ? 'Hiq' : 'Shto'} ${esc(test.formName)}">
          <input type="checkbox" data-plan-toggle="${esc(test.id)}" ${selected ? 'checked' : ''}>
        </label>
        <div class="lab-test-main">
          <div class="lab-test-title">
            <strong>${esc(test.formName)}</strong>
            ${test.albanianName && test.albanianName !== test.formName ? `<small>${esc(test.albanianName)}</small>` : ''}
            <span class="lab-test-category" data-exam-group="${esc(test.examGroup || 'laboratory')}">${esc(category?.title || test.category || 'Laborator')}</span>
          </div>

          ${entry.reasons.length ? `
            <div class="lab-test-rationales">
              ${entry.reasons.map(reason => `
                <div class="lab-rationale">
                  <span>${esc(reason.presentation)}</span>
                  <div>
                    <p>${esc(reason.rationale || 'E përfshirë në work-up-in klinik.')}</p>
                    ${reason.contextNote ? `<p class="lab-test-context">${esc(reason.contextNote)}</p>` : ''}
                  </div>
                </div>`).join('')}
            </div>
          ` : '<p class="lab-test-context">Shtuar manualisht nga katalogu i ekzaminimeve.</p>'}

          ${detailLines ? `
            <details class="lab-test-details">
              <summary>Detajet e ekzaminimit ↓</summary>
              <div class="lab-test-detail-body">${detailLines}</div>
            </details>
          ` : ''}
        </div>
        ${entry.manual ? `<button class="lab-test-remove" type="button" data-remove-manual="${esc(test.id)}">Hiq manualen</button>` : '<span></span>'}
      </article>`;
  }

  function renderPlan() {
    const root = $('#labPlanSections');
    if (!root) return;
    const entries = buildPlanEntries();
    const selectedEntries = entries.filter(entry => !state.excludedTestIds.has(entry.test.id));
    const presentationCount = state.selectedIndicationIds.size;
    const visibleEntries = entries.filter(entry => {
      if (state.examFilter === 'all') return true;
      if (state.examFilter === 'urgent') return entry.tier === 'urgent';
      return (entry.test.examGroup || 'laboratory') === state.examFilter;
    });

    document.querySelectorAll('[data-exam-filter]').forEach(button => {
      const active = button.dataset.examFilter === state.examFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    $('#labSelectedTestCount').textContent = String(selectedEntries.length);
    $('#labCopyPlan').disabled = selectedEntries.length === 0;

    const status = $('#labPlanStatus');
    if (status) {
      if (!entries.length) {
        status.textContent = presentationCount
          ? 'Prezantimet e zgjedhura nuk kanë ekzaminime të lidhura.'
          : 'Zgjidh një shenjë/simptomë ose shto ekzaminim manualisht.';
      } else {
        const filterLabel = state.examFilter === 'all' ? '' : ` · filtër: ${state.examFilter}`;
        status.textContent = `${presentationCount} prezantime · ${entries.length} ekzaminime në panel · ${selectedEntries.length} të zgjedhura${filterLabel}`;
      }
    }

    if (!entries.length) {
      root.innerHTML = `
        <div class="lab-plan-empty">
          <span class="lab-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>
          </span>
          <strong>Zgjidh shenjat ose simptomat sipër.</strong>
          <span>DRx do të propozojë ekzaminimet fillestare dhe ato “vetëm nëse…”, pa krijuar panel të panevojshëm.</span>
        </div>`;
      return;
    }

    if (!visibleEntries.length) {
      root.innerHTML = '<div class="lab-plan-empty"><strong>Nuk ka ekzaminime në këtë filtër.</strong><span>Zgjidh “Të gjitha” ose një kategori tjetër.</span></div>';
      return;
    }

    const grouped = new Map(['urgent','core','recommended','conditional','manual'].map(tier => [tier, []]));
    visibleEntries.forEach(entry => {
      const tier = grouped.has(entry.tier) ? entry.tier : 'recommended';
      grouped.get(tier).push(entry);
    });

    root.innerHTML = [...grouped.entries()]
      .map(([tier, rows]) => tierSectionMarkup(tier, rows))
      .join('');
  }

  function renderGaps() {
    const root = $('#labGapList');
    if (!root) return;
    const merged = [];

    for (const indication of selectedIndications()) {
      for (const flag of indication.redFlags || []) {
        const value = clean(flag);
        if (!value) continue;
        const existing = merged.find(item => normalize(item.text) === normalize(value));
        if (existing) {
          if (!existing.presentations.includes(indication.title)) existing.presentations.push(indication.title);
        } else {
          merged.push({ text:value, presentations:[indication.title] });
        }
      }
    }

    $('#labGapCount').textContent = String(merged.length);
    root.innerHTML = merged.length
      ? merged.map(item => `
        <div class="lab-gap-item is-red-flag">
          <strong>Red flag</strong>
          <p>${esc(item.text)}</p>
          <small>${esc(item.presentations.join(' · '))}</small>
        </div>`).join('')
      : '<p>Nuk ka red flags të bashkuara për prezantimet e zgjedhura.</p>';
  }

  function renderAll() {
    renderDiseaseList();
    renderSelectedDiseases();
    renderPlan();
    renderGaps();
    renderManualResults();
  }

  function clearPlan() {
    state.selectedIndicationIds.clear();
    state.manualTestIds.clear();
    state.excludedTestIds.clear();
    state.diseaseTerm = '';
    state.manualTerm = '';
    state.examFilter = 'all';

    if ($('#labDiseaseSearch')) $('#labDiseaseSearch').value = '';
    if ($('#labManualSearch')) $('#labManualSearch').value = '';

    closeDiseasePicker();
    hideManualResults();
    renderAll();
    syncUrl();
  }

  function togglePlannedTest(id, checked) {
    if (checked) state.excludedTestIds.delete(id);
    else state.excludedTestIds.add(id);
    renderPlan();
  }

  function copyPlanText() {
    const indications = selectedIndications();
    const entries = buildPlanEntries().filter(entry => !state.excludedTestIds.has(entry.test.id));
    const lines = [];

    if (indications.length) {
      lines.push('Shenja / simptoma / gjetje klinike:');
      indications.forEach(item => lines.push(`- ${item.title} · ${item.clinicalType || 'Prezantim klinik'}`));
      lines.push('');
    }

    lines.push('Ekzaminet:');
    entries.forEach(entry => {
      const meta = TIER_META[entry.tier] || TIER_META.recommended;
      lines.push(`- [${meta.label}] ${entry.test.formName} · ${entry.test.category || 'Laborator'}`);
      entry.reasons.forEach(reason => {
        if (reason.rationale) lines.push(`  ↳ ${reason.presentation}: ${reason.rationale}`);
        if (reason.contextNote) lines.push(`     Vetëm nëse/kujdes: ${reason.contextNote}`);
      });
    });

    const flags = [];
    indications.forEach(item => (item.redFlags || []).forEach(flag => {
      const value = clean(flag);
      if (value && !flags.includes(value)) flags.push(value);
    }));
    if (flags.length) {
      lines.push('', 'Red flags:');
      flags.forEach(flag => lines.push(`- ${flag}`));
    }

    lines.push('', 'Shënim: Work-up orientues; përshtate sipas pacientit, ekzaminimit fizik, probabilitetit klinik dhe protokollit lokal.');
    return lines.join('\n');
  }

  function showToast(message) {
    document.querySelector('.lab-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'lab-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  async function copyPlan() {
    const value = copyPlanText();
    try {
      await navigator.clipboard.writeText(value);
      showToast('Lista e ekzaminimeve u kopjua.');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      showToast(copied ? 'Lista e ekzaminimeve u kopjua.' : 'Kopjimi nuk u krye.');
    }
  }

  function bindEvents() {
    $('#labDiseaseTrigger')?.addEventListener('click', toggleDiseasePicker);
    $('#labDiseaseTrigger')?.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      if ($('#labDiseasePopover')?.hidden) openDiseasePicker();
      else $('#labDiseaseSearch')?.focus();
    });

    $('#labDiseaseSearch')?.addEventListener('input', event => {
      state.diseaseTerm = event.target.value || '';
      renderDiseaseList();
    });
    $('#labDiseaseSearch')?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'Enter'].includes(event.key)) return;
      const first = $('#labDiseaseList')?.querySelector('[data-disease-id]');
      if (!first) return;
      event.preventDefault();
      if (event.key === 'Enter') first.click();
      else first.focus();
    });

    $('#labDiseaseList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-disease-id]');
      if (button) toggleIndication(button.dataset.diseaseId);
    });
    $('#labDiseaseList')?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const options = [...event.currentTarget.querySelectorAll('[data-disease-id]')];
      const index = options.indexOf(document.activeElement);
      if (index < 0 || !options.length) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown'
        ? Math.min(options.length - 1, index + 1)
        : Math.max(0, index - 1);
      options[next]?.focus();
    });

    $('#labSelectedDiseases')?.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-disease]');
      if (button) removeIndication(button.dataset.removeDisease);
    });

    $('#labManualSearch')?.addEventListener('input', event => {
      state.manualTerm = event.target.value || '';
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.searchTimer = 0;
        renderManualResults();
      }, 70);
    });
    $('#labManualSearch')?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'Enter'].includes(event.key)) return;
      const first = $('#labManualResults')?.querySelector('[data-add-test]');
      if (!first) return;
      event.preventDefault();
      if (event.key === 'Enter') first.click();
      else first.focus();
    });

    $('#labManualResults')?.addEventListener('click', event => {
      const button = event.target.closest('[data-add-test]');
      if (button) addManualTest(button.dataset.addTest);
    });
    $('#labManualResults')?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const options = [...event.currentTarget.querySelectorAll('[data-add-test]')];
      const index = options.indexOf(document.activeElement);
      if (index < 0 || !options.length) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown'
        ? Math.min(options.length - 1, index + 1)
        : Math.max(0, index - 1);
      options[next]?.focus();
    });

    $('#labPlanSections')?.addEventListener('change', event => {
      const input = event.target.closest('[data-plan-toggle]');
      if (input) togglePlannedTest(input.dataset.planToggle, input.checked);
    });

    $('#labPlanSections')?.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-manual]');
      if (button) removeManualTest(button.dataset.removeManual);
    });

    $('#examModalityFilters')?.addEventListener('click', event => {
      const button = event.target.closest('[data-exam-filter]');
      if (!button) return;
      state.examFilter = button.dataset.examFilter || 'all';
      renderPlan();
    });

    $('#labClearPlan')?.addEventListener('click', clearPlan);
    $('#labCopyPlan')?.addEventListener('click', copyPlan);

    document.addEventListener('click', event => {
      if (!event.target.closest('#labDiseasePicker')) closeDiseasePicker();
      if (!event.target.closest('#labManualPicker')) hideManualResults();
    });
  }

  async function init() {
    loadSharedSidebarTaxonomy();
    bindShell();
    bindEvents();

    try {
      const authPayload = await ensureAuth();
      await syncProfileChrome(authPayload);
      const data = await loadDataset();
      installDataset(data);
      $('#appShell')?.setAttribute('aria-busy', 'false');
    } catch (error) {
      console.error('[Ekzaminet v3]', error);
      $('#syncText').textContent = 'Gabim';
      $('#labTestTotal').textContent = '—';
      $('#labIndicationTotal').textContent = '—';
      $('#labPlanSections').innerHTML = `
        <div class="lab-plan-empty">
          <span class="lab-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4.5 3.5 19.5h17L12 4.5Z"/><path d="M12 9v4M12 16.5h.01"/></svg>
          </span>
          <strong>Ekzaminet nuk u ngarkuan.</strong>
          <span>Kontrollo lidhjen me katalogun laboratorik dhe provo përsëri.</span>
          <button class="lab-clear-plan" type="button" data-lab-retry>Provo përsëri</button>
        </div>`;
      $('#labPlanSections')?.querySelector('[data-lab-retry]')?.addEventListener('click', () => window.location.reload());
      $('#appShell')?.setAttribute('aria-busy', 'false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
