window.MEDINDEX_ICD10 = {
  version: 'WHO ICD-10 2019',
  language: 'sq',
  sourceUrl: 'https://icd.who.int/browse10/2019/en#/J85-J86',
  chapter: {
    code: 'J00–J99',
    title: 'Sëmundjet e sistemit respirator'
  },
  block: {
    code: 'J85–J86',
    title: 'Gjendje supurative dhe nekrotizuese të rrugëve të poshtme respiratore'
  },
  entries: [
    {
      code: 'J85',
      title: 'Abscesi i mushkërisë dhe mediastinit',
      level: 'kategori',
      parent: 'J85–J86',
      keywords: ['absces pulmonar','absces i mushkërisë','mediastin','infeksion nekrotizues'],
      summary: 'Kategori për abscesin, gangrenën ose nekrozën e mushkërisë dhe abscesin e mediastinit.',
      includes: [],
      excludes: [],
      codingNotes: ['Zgjidhe nënkodin sipas pranisë së pneumonisë dhe lokalizimit.']
    },
    {
      code: 'J85.0',
      title: 'Gangrena dhe nekroza e mushkërisë',
      level: 'kod',
      parent: 'J85',
      keywords: ['gangrenë pulmonare','nekrozë pulmonare','mushkëri'],
      summary: 'Përdoret kur dokumentohet gangrenë ose nekrozë e indit pulmonar.',
      includes: [],
      excludes: [],
      codingNotes: ['Dokumentacioni klinik/radiologjik duhet ta mbështesë nekrozën ose gangrenën.']
    },
    {
      code: 'J85.1',
      title: 'Abscesi i mushkërisë me pneumoni',
      level: 'kod',
      parent: 'J85',
      keywords: ['absces pulmonar','pneumoni','kavitet pulmonar'],
      summary: 'Absces pulmonar i dokumentuar bashkë me pneumoni.',
      includes: [],
      excludes: ['Pneumonia nga një shkaktar i përcaktuar kodifikohet në J09–J16 sipas klasifikimit WHO.'],
      codingNotes: ['Mos e përdor si zëvendësim për kodin specifik të pneumonisë kur shkaktari është i përcaktuar.']
    },
    {
      code: 'J85.2',
      title: 'Abscesi i mushkërisë pa pneumoni',
      level: 'kod',
      parent: 'J85',
      keywords: ['absces pulmonar','pa pneumoni','absces i mushkërisë NOS'],
      summary: 'Absces pulmonar pa pneumoni të dokumentuar.',
      includes: ['Abscesi i mushkërisë, i paspecifikuar ndryshe.'],
      excludes: [],
      codingNotes: ['Përdoret kur dokumentacioni nuk tregon pneumoni shoqëruese.']
    },
    {
      code: 'J85.3',
      title: 'Abscesi i mediastinit',
      level: 'kod',
      parent: 'J85',
      keywords: ['absces mediastinal','mediastinit purulent','mediastin'],
      summary: 'Absces i lokalizuar në mediastin.',
      includes: [],
      excludes: [],
      codingNotes: ['Verifiko lokalizimin anatomik në raportin radiologjik ose operativ.']
    },
    {
      code: 'J86',
      title: 'Piotoraksi',
      level: 'kategori',
      parent: 'J85–J86',
      keywords: ['piotoraks','empiemë','pleurë','qelb pleural','pyopneumothorax'],
      summary: 'Qelb në kavitetin pleural, përfshirë empiemën dhe piopneumotoraksin.',
      includes: ['Abscesi i pleurës','Abscesi i toraksit','Empiema','Piopneumotoraksi'],
      excludes: ['Piotoraksi nga tuberkulozi: A15–A16.'],
      codingNotes: ['Kur identifikohet mikroorganizmi, përdor kod shtesë nga B95–B98.','Zgjidhe J86.0 kur ka fistulë dhe J86.9 kur nuk ka fistulë.']
    },
    {
      code: 'J86.0',
      title: 'Piotoraksi me fistulë',
      level: 'kod',
      parent: 'J86',
      keywords: ['piotoraks me fistulë','empiemë me fistulë','fistulë pleurale'],
      summary: 'Piotoraks i shoqëruar me fistulë.',
      includes: [],
      excludes: ['Piotoraksi nga tuberkulozi: A15–A16.'],
      codingNotes: ['Dokumento llojin dhe vendin e fistulës kur është i njohur.','Kur identifikohet mikroorganizmi, shto kodin përkatës B95–B98.']
    },
    {
      code: 'J86.9',
      title: 'Piotoraksi pa fistulë',
      level: 'kod',
      parent: 'J86',
      keywords: ['piotoraks pa fistulë','empiemë pleurale','empiemë kronike'],
      summary: 'Piotoraks ose empiemë pa fistulë të dokumentuar.',
      includes: ['Empiema pleurale kronike, e paspecifikuar ndryshe.'],
      excludes: ['Piotoraksi nga tuberkulozi: A15–A16.'],
      codingNotes: ['Kur identifikohet mikroorganizmi, shto kodin përkatës B95–B98.']
    }
  ]
};