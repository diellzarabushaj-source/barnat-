(() => {
  'use strict';

  const normalize = value => String(value || '')
    .trim()
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const slugify = value => normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pa-kategori';

  const CHAPTERS = [
    {
      key: 'qasja-reanimimi', order: 1,
      title: 'Qasja fillestare & reanimimi', shortTitle: 'Qasja & reanimimi',
      patterns: [/reanimim/, /arrest kardiak/, /cardiac arrest/, /\bcpr\b/, /\bbls\b/, /\bals\b/, /\babcde\b/],
      subchapters: [
        {key:'abcde', order:1, title:'Vlerësimi ABCDE', patterns:[/\babcde\b/, /vleresimi fillestar/, /pacienti instabil/]},
        {key:'arresti-kardiak', order:2, title:'Arresti kardiak', patterns:[/arrest kardiak/, /cardiac arrest/, /\bcpr\b/, /defibril/]},
        {key:'rruga-ajrore', order:3, title:'Rruga ajrore dhe ventilimi', patterns:[/rruga ajrore/, /airway/, /ventilim/, /bag mask/]},
      ],
    },
    {
      key: 'kardiovaskulare', order: 2,
      title: 'Urgjencat kardiovaskulare', shortTitle: 'Kardiovaskulare',
      patterns: [/kardiolog/, /kardiopulmon/, /koronar/, /\bacs\b/, /stemi/, /nstemi/, /aritmi/, /bradikardi/, /takikardi/, /edema pulmonare/, /insuficienca kardiake/, /hipertens/, /aort/, /tamponad/, /sinkop/],
      subchapters: [
        {key:'acs', order:1, title:'Sindroma koronare akute', patterns:[/\bacs\b/, /koronar/, /stemi/, /nstemi/, /angina/, /infarkt/]},
        {key:'aritmite', order:2, title:'Aritmitë akute', patterns:[/aritmi/, /bradikardi/, /takikardi/, /\bsvt\b/, /torsades/, /fibrilacion atrial/]},
        {key:'insuficienca-kardiake', order:3, title:'Insuficienca kardiake akute / edema pulmonare', patterns:[/edema pulmonare/, /insuficienca kardiake/, /kardiopulmon/]},
        {key:'kriza-hipertensive', order:4, title:'Kriza hipertensive', patterns:[/hipertens/]},
        {key:'sinkopa', order:5, title:'Sinkopa', patterns:[/sinkop/]},
        {key:'aorta-tamponada', order:6, title:'Aorta dhe tamponada', patterns:[/aort/, /tamponad/]},
      ],
    },
    {
      key: 'respiratore', order: 3,
      title: 'Urgjencat respiratore', shortTitle: 'Respiratore',
      patterns: [/pneumolog/, /respirator/, /astm/, /\bcopd\b/, /dispne/, /emboli pulmonare/, /pneumotoraks/, /pneumoni/, /stridor/, /mbytje/, /choking/],
      subchapters: [
        {key:'astma', order:1, title:'Astma akute', patterns:[/astm/]},
        {key:'copd', order:2, title:'Ekzacerbimi akut i COPD', patterns:[/\bcopd\b/]},
        {key:'rruga-ajrore', order:3, title:'Obstruksioni i rrugës ajrore', patterns:[/obstruksion/, /stridor/, /mbytje/, /choking/]},
        {key:'embolia-pulmonare', order:4, title:'Embolia pulmonare', patterns:[/emboli pulmonare/, /pulmonary embol/]},
        {key:'pneumotoraksi', order:5, title:'Pneumotoraksi', patterns:[/pneumotoraks/]},
        {key:'pneumonia', order:6, title:'Pneumonia e rëndë / insuficienca respiratore', patterns:[/pneumoni/, /insuficienca respiratore/]},
      ],
    },
    {
      key: 'shoku-infektive', order: 4,
      title: 'Shoku & urgjencat infektive', shortTitle: 'Shoku & infektive',
      patterns: [/infektolog/, /sepsis/, /septik/, /\bshok\b/, /\bshock\b/, /meningit/, /encefalit/, /urosepsis/],
      subchapters: [
        {key:'shoku', order:1, title:'Shoku', patterns:[/\bshok\b/, /\bshock\b/]},
        {key:'sepsis', order:2, title:'Sepsis dhe shoku septik', patterns:[/sepsis/, /septik/]},
        {key:'meningiti-encefaliti', order:3, title:'Meningiti / encefaliti', patterns:[/meningit/, /encefalit/]},
      ],
    },
    {
      key: 'alergjike', order: 5,
      title: 'Urgjencat alergjike', shortTitle: 'Alergjike',
      patterns: [/alergji/, /anafil/, /angioedem/, /urtikari/],
      subchapters: [
        {key:'anafilaksia', order:1, title:'Anafilaksia', patterns:[/anafil/]},
        {key:'angioedema', order:2, title:'Angioedema', patterns:[/angioedem/]},
        {key:'urtikaria', order:3, title:'Urtikaria / reaksionet alergjike', patterns:[/urtikari/, /reaksion alergjik/]},
      ],
    },
    {
      key: 'neurologjike', order: 6,
      title: 'Urgjencat neurologjike', shortTitle: 'Neurologjike',
      patterns: [/neurolog/, /stroke/, /\btia\b/, /konvulsion/, /epilept/, /koma/, /humbje e vetedijes/, /vertigo/, /delir/, /dhimbje koke/],
      subchapters: [
        {key:'stroke-tia', order:1, title:'Stroke / TIA', patterns:[/stroke/, /\btia\b/, /iktus/]},
        {key:'konvulsionet', order:2, title:'Konvulsionet / status epileptik', patterns:[/konvulsion/, /epilept/]},
        {key:'vetedija-koma', order:3, title:'Humbja e vetëdijes / koma', patterns:[/humbje e vetedijes/, /koma/]},
        {key:'cefalea-vertigo', order:4, title:'Cefalea akute / vertigo', patterns:[/dhimbje koke/, /cefale/, /vertigo/]},
        {key:'deliriumi', order:5, title:'Deliriumi / agjitacioni akut', patterns:[/delir/, /agjitacion/]},
      ],
    },
    {
      key: 'endokrine-metabolike', order: 7,
      title: 'Urgjencat endokrine & metabolike', shortTitle: 'Endokrine & metabolike',
      patterns: [/endokrin/, /hipoglik/, /hiperglik/, /ketoacidoz/, /\bdka\b/, /\bhhs\b/, /natrium/, /kalium/, /hiperkal/, /hipokal/, /adrenal/, /tiroid/],
      subchapters: [
        {key:'hipoglikemia', order:1, title:'Hipoglikemia', patterns:[/hipoglik/]},
        {key:'dka-hhs', order:2, title:'DKA / HHS', patterns:[/\bdka\b/, /\bhhs\b/, /ketoacidoz/, /hiperglik/]},
        {key:'elektrolitet', order:3, title:'Çrregullimet elektrolitike', patterns:[/natrium/, /kalium/, /hiperkal/, /hipokal/, /hiponatr/, /hipernatr/, /kalcium/]},
        {key:'krizat-endokrine', order:4, title:'Kriza adrenale / urgjencat tiroide', patterns:[/adrenal/, /tiroid/]},
      ],
    },
    {
      key: 'toksikologjia', order: 8,
      title: 'Toksikologjia & intoksikimet', shortTitle: 'Toksikologjia',
      patterns: [/toksik/, /intoksik/, /overdose/, /opioid/, /benzodiazep/, /paracetamol/, /salicilat/, /monoksid karboni/, /organofosfat/],
      subchapters: [
        {key:'qasja-toksikologjike', order:1, title:'Qasja ndaj pacientit të helmuar', patterns:[/toksik/, /intoksik/, /helmim/]},
        {key:'opioidet', order:2, title:'Opioidet', patterns:[/opioid/, /nalokson/]},
        {key:'barnat', order:3, title:'Mbidozimi me barna', patterns:[/benzodiazep/, /paracetamol/, /salicilat/, /triciklik/]},
        {key:'gazra-kimikate', order:4, title:'CO / pesticide / kimikate', patterns:[/monoksid karboni/, /organofosfat/, /kimikat/]},
      ],
    },
    {
      key: 'gastro-abdominale', order: 9,
      title: 'Urgjencat gastrointestinale & abdominale', shortTitle: 'Gastro & abdominale',
      patterns: [/gastro/, /abdomen/, /apend/, /kolecist/, /kolangit/, /pankreat/, /ileus/, /obstruksion intestinal/, /hematemez/, /melena/],
      subchapters: [
        {key:'abdomeni-akut', order:1, title:'Abdomeni akut', patterns:[/abdomeni akut/, /abdominal/]},
        {key:'kirurgjike', order:2, title:'Apendiciti / kolecistiti / pankreatiti', patterns:[/apend/, /kolecist/, /kolangit/, /pankreat/]},
        {key:'obstruksioni-perforimi', order:3, title:'Obstruksioni / perforimi', patterns:[/obstruksion intestinal/, /ileus/, /perfor/]},
        {key:'gjakderdhja-gi', order:4, title:'Gjakderdhja gastrointestinale', patterns:[/hemorragji gastro/, /hematemez/, /melena/, /gjakderdhje gastro/]},
      ],
    },
    {
      key: 'urologjike-renale', order: 10,
      title: 'Urgjencat urologjike & renale', shortTitle: 'Urologjike & renale',
      patterns: [/urolog/, /renal/, /kolike renale/, /retencion urinar/, /pielonefrit/, /hematuri/, /\baki\b/, /torsion testikular/, /priapiz/],
      subchapters: [
        {key:'kolika-retencioni', order:1, title:'Kolika renale / retencioni urinar', patterns:[/kolike renale/, /retencion urinar/]},
        {key:'infeksionet', order:2, title:'Pielonefriti / urosepsis', patterns:[/pielonefrit/, /urosepsis/]},
        {key:'demtimi-renal', order:3, title:'Hematuria / dëmtimi akut renal', patterns:[/hematuri/, /\baki\b/, /demtim akut renal/]},
        {key:'skrotale', order:4, title:'Torsioni testikular / priapizmi', patterns:[/torsion testikular/, /priapiz/]},
      ],
    },
    {
      key: 'trauma', order: 11,
      title: 'Trauma', shortTitle: 'Trauma',
      patterns: [/trauma/, /plage/, /fraktur/, /dislokim/, /laceracion/, /demtim koke/, /cervikal/, /torakal/],
      subchapters: [
        {key:'vleresimi-traumes', order:1, title:'Vlerësimi primar i traumës', patterns:[/vleresimi primar/, /major trauma/, /politrauma/]},
        {key:'koka-qafa', order:2, title:'Trauma e kokës / qafës', patterns:[/demtim koke/, /trauma e kokes/, /cervikal/]},
        {key:'toraksi-abdomeni', order:3, title:'Trauma torakale / abdominale', patterns:[/torakal/, /toraks/]},
        {key:'frakturat', order:4, title:'Frakturat / dislokimet', patterns:[/fraktur/, /dislokim/]},
        {key:'plaget', order:5, title:'Plagët dhe kontrolli i gjakderdhjes', patterns:[/plage/, /laceracion/, /gjakderdh/]},
      ],
    },
    {
      key: 'djegiet-ambientale', order: 12,
      title: 'Djegiet & urgjencat ambientale', shortTitle: 'Djegiet & ambientale',
      patterns: [/djeg/, /hipotermi/, /hipertermi/, /heat stroke/, /mbytje ne uje/, /drowning/, /elektrokut/],
      subchapters: [
        {key:'djegiet', order:1, title:'Djegiet', patterns:[/djeg/]},
        {key:'temperatura', order:2, title:'Hipotermia / hipertermia', patterns:[/hipotermi/, /hipertermi/, /heat stroke/]},
        {key:'mbytja-elektriciteti', order:3, title:'Mbytja / elektrokutimi', patterns:[/mbytje ne uje/, /drowning/, /elektrokut/]},
      ],
    },
    {
      key: 'obstetrike-gjinekologjike', order: 13,
      title: 'Urgjencat obstetrike & gjinekologjike', shortTitle: 'Obstetrike & gjinekologjike',
      patterns: [/obstetr/, /gjinekolog/, /shtatzen/, /ektopike/, /preeklamps/, /eklamps/, /\bhellp\b/, /postpartum/, /pelvik/, /ovarian/],
      subchapters: [
        {key:'hemorragjia-shtatzenise', order:1, title:'Gjakderdhja në shtatzëni / shtatzënia ektopike', patterns:[/gjakderdh.*shtatzen/, /ektopike/]},
        {key:'preeklampsia', order:2, title:'Preeklampsia / eklampsia / HELLP', patterns:[/preeklamps/, /eklamps/, /\bhellp\b/]},
        {key:'postpartum-lindja', order:3, title:'Hemorragjia postpartum / lindja emergjente', patterns:[/postpartum/, /lindja emergjente/]},
        {key:'dhimbja-pelvike', order:4, title:'Dhimbja akute pelvike', patterns:[/pelvik/, /ovarian/]},
      ],
    },
    {
      key: 'pediatrike', order: 14,
      title: 'Urgjencat pediatrike', shortTitle: 'Pediatrike',
      patterns: [/pediatr/, /femije/, /foshnje/, /croup/, /bronkiolit/, /konvulsion febril/],
      subchapters: [
        {key:'pediatric-abcde', order:1, title:'ABCDE / reanimimi pediatrik', patterns:[/\babcde\b/, /arrest kardiak/]},
        {key:'respiratore', order:2, title:'Croup / bronkiolit / astmë', patterns:[/croup/, /bronkiolit/, /astm/]},
        {key:'neurologjike', order:3, title:'Konvulsionet', patterns:[/konvulsion/]},
        {key:'sepsis-dehidratim', order:4, title:'Sepsis / dehidratim', patterns:[/sepsis/, /dehidrat/]},
      ],
    },
    {
      key: 'orl-oftalmo-stomatologjike', order: 15,
      title: 'Urgjencat ORL, oftalmologjike & stomatologjike', shortTitle: 'ORL / sy / stomatologji',
      patterns: [/\borl\b/, /epistaks/, /oftalm/, /syrit/, /glaukom/, /stomatolog/, /dentar/, /epiglotit/, /peritonsilar/],
      subchapters: [
        {key:'orl', order:1, title:'ORL', patterns:[/\borl\b/, /epistaks/, /epiglotit/, /peritonsilar/]},
        {key:'syri', order:2, title:'Urgjencat e syrit', patterns:[/oftalm/, /syrit/, /glaukom/]},
        {key:'dental', order:3, title:'Infeksionet dentare', patterns:[/stomatolog/, /dentar/]},
      ],
    },
    {
      key: 'psikiatrike', order: 16,
      title: 'Urgjencat psikiatrike', shortTitle: 'Psikiatrike',
      patterns: [/psikiatr/, /agjitacion/, /agresiv/, /psikoze/, /suicid/, /panik/, /withdrawal/, /abstinence/],
      subchapters: [
        {key:'agjitacioni', order:1, title:'Agjitacioni / agresiviteti', patterns:[/agjitacion/, /agresiv/]},
        {key:'psikoza-suicidi', order:2, title:'Psikoza akute / rreziku suicidar', patterns:[/psikoze/, /suicid/]},
        {key:'paniku-abstinenca', order:3, title:'Panik / abstinencë', patterns:[/panik/, /withdrawal/, /abstinence/]},
      ],
    },
    {
      key: 'procedurat', order: 17,
      title: 'Procedurat e urgjencës', shortTitle: 'Procedurat',
      patterns: [/procedure/, /akses iv/, /akses io/, /oksigjen/, /defibril/, /kardioversion/, /nebuliz/, /suturo/, /imobiliz/],
      subchapters: [],
    },
    {
      key: 'barnat-urgjences', order: 18,
      title: 'Barnat kryesore të urgjencës', shortTitle: 'Barnat e urgjencës',
      patterns: [/barnat e urgjences/, /adrenaline/, /amiodaron/, /adenozin/, /atropin/, /nalokson/, /glukagon/],
      subchapters: [],
    },
  ];

  const chapterByKey = new Map(CHAPTERS.map(chapter => [chapter.key, chapter]));

  function categoryText(item) {
    return normalize(item?.category);
  }

  function identityText(item) {
    return normalize([
      item?.title,
      ...(Array.isArray(item?.aliases) ? item.aliases : []),
    ].filter(Boolean).join(' '));
  }

  function matches(patterns, text) {
    return Boolean(text) && (patterns || []).some(pattern => pattern.test(text));
  }

  function explicitChapter(item) {
    if (!item?.chapterKey && !item?.chapterTitle) return null;
    const known = chapterByKey.get(String(item.chapterKey || ''));
    if (known) return known;
    const title = String(item.chapterTitle || item.chapterKey || 'Kapitull tjetër').trim();
    return {
      key: String(item.chapterKey || slugify(title)),
      order: Number.isFinite(Number(item.chapterOrder)) ? Number(item.chapterOrder) : 99,
      title,
      shortTitle: title,
      patterns: [],
      subchapters: [],
    };
  }

  function inferChapter(item) {
    const explicit = explicitChapter(item);
    if (explicit) return explicit;

    const category = categoryText(item);
    const categoryMatch = CHAPTERS.find(chapter => matches(chapter.patterns, category));
    if (categoryMatch) return categoryMatch;

    const identity = identityText(item);
    const identityMatch = CHAPTERS.find(chapter => matches(chapter.patterns, identity));
    if (identityMatch) return identityMatch;

    return {
      key: 'te-tjera',
      order: 99,
      title: 'Urgjenca të tjera',
      shortTitle: 'Të tjera',
      patterns: [],
      subchapters: [],
    };
  }

  function inferSubchapter(item, chapter) {
    if (item?.subchapterKey || item?.subchapterTitle) {
      const title = String(item.subchapterTitle || item.subchapterKey || 'Tjetër').trim();
      return {
        key: String(item.subchapterKey || slugify(title)),
        order: Number.isFinite(Number(item.subchapterOrder)) ? Number(item.subchapterOrder) : 99,
        title,
      };
    }

    const category = categoryText(item);
    const identity = identityText(item);
    const known = (chapter?.subchapters || []).find(subchapter =>
      matches(subchapter.patterns, category) || matches(subchapter.patterns, identity)
    );
    if (known) return known;

    const rawCategory = String(item?.category || '').trim();
    const suffix = rawCategory.includes('/') ? rawCategory.split('/').slice(1).join('/').trim() : '';
    const title = suffix || String(item?.title || 'Tjetër').trim();
    return {key: slugify(title), order: 99, title};
  }

  function resolve(item) {
    const chapter = inferChapter(item);
    const subchapter = inferSubchapter(item, chapter);
    return Object.freeze({
      chapterKey: chapter.key,
      chapterOrder: chapter.order,
      chapterTitle: chapter.title,
      chapterShortTitle: chapter.shortTitle || chapter.title,
      subchapterKey: subchapter.key,
      subchapterOrder: subchapter.order,
      subchapterTitle: subchapter.title,
    });
  }

  function summarize(items) {
    const chapters = new Map();
    (Array.isArray(items) ? items : []).forEach(item => {
      const taxonomy = resolve(item);
      let chapter = chapters.get(taxonomy.chapterKey);
      if (!chapter) {
        chapter = {
          key: taxonomy.chapterKey,
          order: taxonomy.chapterOrder,
          title: taxonomy.chapterTitle,
          shortTitle: taxonomy.chapterShortTitle,
          count: 0,
          subchapters: new Map(),
        };
        chapters.set(chapter.key, chapter);
      }
      chapter.count += 1;
      let subchapter = chapter.subchapters.get(taxonomy.subchapterKey);
      if (!subchapter) {
        subchapter = {
          key: taxonomy.subchapterKey,
          order: taxonomy.subchapterOrder,
          title: taxonomy.subchapterTitle,
          count: 0,
        };
        chapter.subchapters.set(subchapter.key, subchapter);
      }
      subchapter.count += 1;
    });

    return [...chapters.values()]
      .map(chapter => ({
        ...chapter,
        subchapters: [...chapter.subchapters.values()].sort((a, b) =>
          a.order - b.order || a.title.localeCompare(b.title, 'sq')
        ),
      }))
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'sq'));
  }

  window.MedIndexEmergencyTaxonomy = Object.freeze({
    chapters: Object.freeze(CHAPTERS.map(chapter => Object.freeze({
      key: chapter.key,
      order: chapter.order,
      title: chapter.title,
      shortTitle: chapter.shortTitle,
    }))),
    resolve,
    summarize,
    slugify,
  });
})();
