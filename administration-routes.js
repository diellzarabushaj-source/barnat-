(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexAdministrationRoutes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATEGORIES = Object.freeze({
    ENTERAL:Object.freeze({
      key:'ENTERAL', label:'Enterale', description:'Përmes traktit gastrointestinal ose mukozës orale',
      routes:Object.freeze(['PO', 'SL', 'BUCCAL', 'PR']), defaultRoute:'PO',
    }),
    PARENTERAL:Object.freeze({
      key:'PARENTERAL', label:'Parenterale', description:'Injeksion ose infuzion',
      routes:Object.freeze(['IV', 'IM', 'SC', 'ID']), defaultRoute:'',
    }),
    TOPICAL_LOCAL:Object.freeze({
      key:'TOPICAL_LOCAL', label:'Topike / lokale', description:'Lëkurë, sy, vesh, hundë ose transdermale',
      routes:Object.freeze(['TOP', 'OPH', 'OTIC', 'NASAL', 'TD']), defaultRoute:'',
    }),
    INHALATION:Object.freeze({
      key:'INHALATION', label:'Inhalatore', description:'Përmes rrugëve të frymëmarrjes',
      routes:Object.freeze(['INH', 'MDI', 'DPI', 'NEB']), defaultRoute:'',
    }),
  });

  const CATEGORY_ORDER = Object.freeze(['ENTERAL', 'PARENTERAL', 'TOPICAL_LOCAL', 'INHALATION']);
  const ROUTE_LABELS = Object.freeze({
    PO:'orale', SL:'sublinguale', BUCCAL:'bukale', PR:'rektale',
    IV:'intravenoze', IM:'intramuskulare', SC:'subkutane', ID:'intradermale',
    TOP:'dermatologjike', OPH:'oftalmike', OTIC:'otike', NASAL:'nazale', TD:'transdermale',
    INH:'inhalatore', MDI:'MDI', DPI:'DPI', NEB:'nebulizator',
  });

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fold = value => text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq');

  function normalizeCategory(value) {
    const source = fold(value).replace(/[^a-z0-9]+/g, '');
    if (!source) return '';
    if (/^(enteral|oral|gastrointestinal)$/.test(source)) return 'ENTERAL';
    if (/^(parenteral|injective|injektive)$/.test(source)) return 'PARENTERAL';
    if (/^(topicallocal|topical|topike|lokale|local)$/.test(source)) return 'TOPICAL_LOCAL';
    if (/^(inhalation|inhalatore|inhaled|respiratory)$/.test(source)) return 'INHALATION';
    return CATEGORY_ORDER.includes(text(value).toUpperCase()) ? text(value).toUpperCase() : '';
  }

  function routeTokens(value) {
    const source = fold(value);
    const routes = [];
    const add = route => { if (!routes.includes(route)) routes.push(route); };

    if (/\bi\.?v\.?\b|intraven|venoz|perfuzion/.test(source)) add('IV');
    if (/\bi\.?m\.?\b|intramusk/.test(source)) add('IM');
    if (/\bs\.?c\.?\b|subkutan|subcutan|nenlekure/.test(source)) add('SC');
    if (/\bi\.?d\.?\b|intraderm/.test(source)) add('ID');

    if (/\bp\.?o\.?\b|per\s*os|oral|nga goja/.test(source)) add('PO');
    if (/subling/.test(source)) add('SL');
    if (/bukal|buccal/.test(source)) add('BUCCAL');
    if (/rektal|rectal|suppositor|supozitor|klizm|enema/.test(source)) add('PR');

    if (/oftalm|ophthalm|okular|ocular|eye\s*drops?|pika\s*(per|për)?\s*sy/.test(source)) add('OPH');
    if (/otik|otic|ear\s*drops?|pika\s*(per|për)?\s*vesh/.test(source)) add('OTIC');
    if (/nazal|nasal|intranas/.test(source)) add('NASAL');
    if (/transderm|patch|flaster|ngjites/.test(source)) add('TD');
    if (/topik|topical|kutan|cutaneous|dermal|lekure/.test(source)) add('TOP');

    if (/metered\s*dose|\bmdi\b/.test(source)) add('MDI');
    if (/dry\s*powder|\bdpi\b/.test(source)) add('DPI');
    if (/nebul|mjergull/.test(source)) add('NEB');
    if (/inhal|aerosol|respirator/.test(source)) add('INH');

    if (routes.some(route => ['MDI', 'DPI', 'NEB'].includes(route))) {
      const genericIndex = routes.indexOf('INH');
      if (genericIndex >= 0) routes.splice(genericIndex, 1);
    }
    return routes;
  }

  function normalizeRoute(value) {
    const tokens = routeTokens(value);
    return tokens.length === 1 ? tokens[0] : '';
  }

  function categoryForRoute(route) {
    const normalized = text(route).toUpperCase();
    return CATEGORY_ORDER.find(key => CATEGORIES[key].routes.includes(normalized)) || '';
  }

  function routesForCategory(category) {
    return CATEGORIES[normalizeCategory(category)]?.routes || [];
  }

  function routeBelongsToCategory(route, category) {
    return routesForCategory(category).includes(text(route).toUpperCase());
  }

  function explicitSource(value = {}) {
    return [
      value.route,
      value.routes,
      value.allowedRoutes,
      value.administrationRoute,
      value.administrationRoutes,
      value['Rruga'],
      value['Rrugët e lejuara'],
      value['Rruga — Të rritur'],
      value['Rruga — Fëmijë'],
      value.prescriptionLine,
      value.prescriptionNotation,
      value.sheetPrescriptionNotation,
    ].filter(Boolean).join(' ');
  }

  function formInference(formValue) {
    const form = fold(formValue);
    if (!form) return { category:'', routes:[], confidence:'unknown' };

    if (/inhal|nebul|aerosol|respir|dry\s*powder|metered\s*dose/.test(form)) {
      const routes = routeTokens(form);
      return { category:'INHALATION', routes:routes.length ? routes : [], confidence:'form' };
    }
    if (/subling/.test(form)) return { category:'ENTERAL', routes:['SL'], confidence:'form' };
    if (/bukal|buccal|oromuk/.test(form)) return { category:'ENTERAL', routes:['BUCCAL'], confidence:'form' };
    if (/rektal|rectal|suppositor|supozitor|klizm|enema/.test(form)) return { category:'ENTERAL', routes:['PR'], confidence:'form' };
    if (/ophthalm|oftalm|ocular|okular|eye\s*(drop|ointment|gel)/.test(form)) return { category:'TOPICAL_LOCAL', routes:['OPH'], confidence:'form' };
    if (/otic|ear\s*drops?/.test(form)) return { category:'TOPICAL_LOCAL', routes:['OTIC'], confidence:'form' };
    if (/nasal|intranas/.test(form)) return { category:'TOPICAL_LOCAL', routes:['NASAL'], confidence:'form' };
    if (/transderm|patch|flaster/.test(form)) return { category:'TOPICAL_LOCAL', routes:['TD'], confidence:'form' };
    if (/cream|krem|ointment|pomad|unguent|gel|lotion|locion|cutaneous|kutan|dermal|skin/.test(form)) {
      return { category:'TOPICAL_LOCAL', routes:['TOP'], confidence:'form' };
    }
    if (/injection|injeks|infusion|infuz|parenter|vial|flakon|ampou|ampul|lyophilis/.test(form)) {
      const routes = routeTokens(form).filter(route => categoryForRoute(route) === 'PARENTERAL');
      return { category:'PARENTERAL', routes, confidence:'form' };
    }
    if (/tablet|capsul|kapsul|syrup|sirup|oral|suspension|pezullim|granul|lozenge|pastil|solution\s*for\s*oral/.test(form)) {
      return { category:'ENTERAL', routes:['PO'], confidence:'form' };
    }
    return { category:'', routes:[], confidence:'unknown' };
  }

  function inferAdministration(value = {}) {
    const explicitCategory = normalizeCategory(
      value.administrationCategory
      || value.category
      || value['Kategoria e administrimit']
      || value['Kategoria'],
    );
    const explicitRoutes = routeTokens(explicitSource(value));
    const routeCategories = [...new Set(explicitRoutes.map(categoryForRoute).filter(Boolean))];
    const form = value.form || value.pharmaceuticalForm || value.pharmaceutical_form
      || value['Forma farmaceutike'] || value['Forma'];
    const byForm = formInference(form);

    let category = explicitCategory;
    let confidence = explicitCategory ? 'explicit-category' : 'unknown';
    if (!category && routeCategories.length === 1) {
      category = routeCategories[0];
      confidence = 'explicit-route';
    }
    if (!category && byForm.category) {
      category = byForm.category;
      confidence = byForm.confidence;
    }

    const routes = [...new Set([
      ...explicitRoutes.filter(route => !category || categoryForRoute(route) === category),
      ...byForm.routes.filter(route => !category || categoryForRoute(route) === category),
    ])];
    const route = routes.length === 1 ? routes[0] : '';

    return {
      category,
      routes,
      route,
      ambiguous:routes.length > 1 || !category,
      confidence,
      categoryLabel:CATEGORIES[category]?.label || 'E papërcaktuar',
      routeLabel:ROUTE_LABELS[route] || '',
    };
  }

  function categoryLabel(value) {
    return CATEGORIES[normalizeCategory(value)]?.label || '';
  }

  function routeLabel(value) {
    return ROUTE_LABELS[text(value).toUpperCase()] || text(value);
  }

  function routePhrase(value) {
    const route = text(value).toUpperCase();
    const phrases = {
      PO:'nga goja', SL:'nën gjuhë', BUCCAL:'në mukozën bukale', PR:'rektalisht',
      IV:'intravenoz', IM:'intramuskularisht', SC:'nënlëkurë', ID:'intradermalisht',
      TOP:'në lëkurë', OPH:'në sy', OTIC:'në vesh', NASAL:'në hundë', TD:'transdermalisht',
      INH:'me inhalim', MDI:'me inhalator MDI', DPI:'me inhalator DPI', NEB:'me nebulizator',
    };
    return phrases[route] || text(value);
  }

  return {
    CATEGORIES,
    CATEGORY_ORDER,
    ROUTE_LABELS,
    normalizeCategory,
    normalizeRoute,
    routeTokens,
    categoryForRoute,
    routesForCategory,
    routeBelongsToCategory,
    inferAdministration,
    formInference,
    categoryLabel,
    routeLabel,
    routePhrase,
  };
});