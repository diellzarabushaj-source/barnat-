(() => {
  'use strict';

  const PROJECT_ID = '4wdtp8cz';
  const DATASET = 'production';
  const API_VERSION = '2026-08-05';
  const BASE_URL = `https://${PROJECT_ID}.apicdn.sanity.io/v${API_VERSION}/data/query/${DATASET}`;

  async function query(groq, params = {}, options = {}) {
    const url = new URL(BASE_URL);
    url.searchParams.set('query', groq);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(`$${key}`, JSON.stringify(value));
    });

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      const response = await fetch(url, {
        method:'GET',
        headers:{ Accept:'application/json' },
        cache:options.cache || 'no-cache',
        signal:controller.signal,
      });
      if (!response.ok) throw new Error(`Sanity ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.description || 'Sanity query failed');
      return payload.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.MedIndexSanity = Object.freeze({
    projectId:PROJECT_ID,
    dataset:DATASET,
    studioUrl:'https://medindex-clinical-knowledge.sanity.studio/',
    query,
  });
})();
