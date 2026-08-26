'use strict';

/*
 * DRx Journal — lexon artikujt e publikuar nga Sanity.
 *
 * Dataset-i `production` i projektit është publik, prandaj kërkesa shkon
 * drejtpërdrejt te API-ja e CDN-së pa çelës dhe pa funksion serverless — gjë
 * që e ruan edhe slotin e rezervuar të planit Hobby. Të dy host-et janë
 * tashmë në `connect-src` të CSP-së, dhe `cdn.sanity.io` në `img-src`.
 *
 * Faqja niset me gjendjen e ngarkimit të vizatuar në HTML, prandaj nuk ka
 * kërcim layout-i kur përgjigja mbërrin.
 */

(() => {
  const PROJECT = '4wdtp8cz';
  const DATASET = 'production';
  const API = `https://${PROJECT}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}`;

  const QUERY = `*[_type == "blogPost" && !(_id in path("drafts.**"))]
    | order(publishedAt desc){
      title,
      "slug": slug.current,
      excerpt,
      category,
      language,
      publishedAt,
      "author": author->name,
      "authorRole": author->role,
      "cover": coverImage.asset->url
    }`;

  const grid = document.getElementById('jrGrid');
  const lead = document.getElementById('jrLead');
  const loading = document.getElementById('jrLoading');
  const empty = document.getElementById('jrEmpty');
  const failed = document.getElementById('jrError');
  const count = document.getElementById('jrCount');

  const MONTHS = [
    'janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor',
    'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor',
  ];

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  function show(node) { if (node) node.hidden = false; }
  function hide(node) { if (node) node.hidden = true; }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function coverNode(post, className, emptyClassName) {
    if (post.cover) {
      const image = element('img', className);
      image.src = `${post.cover}?w=1200&fit=max&auto=format`;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      return image;
    }
    const placeholder = element('span', `${className} ${emptyClassName}`);
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
  }

  function metaRow(post) {
    const row = element('div', 'jr-card__meta');
    if (post.category) row.appendChild(element('span', 'lp-eyebrow', post.category));
    return row;
  }

  function footRow(post) {
    const foot = element('div', 'jr-card__foot');
    if (post.author) foot.appendChild(element('span', 'jr-card__author', post.author));
    const date = formatDate(post.publishedAt);
    if (date) foot.appendChild(element('span', 'lp-num', date));
    return foot;
  }

  function renderLead(post) {
    const media = element('div', 'jr-lead__media');
    media.appendChild(coverNode(post, 'jr-lead__cover', 'jr-card__cover--empty'));

    const body = element('div', 'jr-lead__body');
    body.appendChild(metaRow(post));

    const heading = element('h2');
    const link = element('a', null, post.title || 'Pa titull');
    link.href = post.slug ? `journal.html#${post.slug}` : 'journal.html';
    heading.appendChild(link);
    body.appendChild(heading);

    if (post.excerpt) body.appendChild(element('p', null, post.excerpt));
    body.appendChild(footRow(post));

    lead.textContent = '';
    lead.appendChild(body);
    lead.appendChild(media);
    show(lead);
  }

  function renderCard(post) {
    const card = element('article', 'jr-card');
    card.appendChild(coverNode(post, 'jr-card__cover', 'jr-card__cover--empty'));

    const body = element('div', 'jr-card__body');
    body.appendChild(metaRow(post));

    const heading = element('h3');
    const link = element('a', null, post.title || 'Pa titull');
    link.href = post.slug ? `journal.html#${post.slug}` : 'journal.html';
    heading.appendChild(link);
    body.appendChild(heading);

    if (post.excerpt) body.appendChild(element('p', 'jr-card__excerpt', post.excerpt));
    body.appendChild(footRow(post));

    card.appendChild(body);
    return card;
  }

  function render(posts) {
    hide(loading);

    if (!posts.length) {
      show(empty);
      return;
    }

    const [first, ...rest] = posts;
    renderLead(first);

    grid.textContent = '';
    for (const post of rest) grid.appendChild(renderCard(post));
    if (rest.length) show(grid);

    if (count) {
      count.textContent = posts.length === 1
        ? '1 artikull i publikuar'
        : `${posts.length} artikuj të publikuar`;
    }
  }

  async function load() {
    const url = `${API}?query=${encodeURIComponent(QUERY)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      render(Array.isArray(payload.result) ? payload.result : []);
    } catch (error) {
      hide(loading);
      show(failed);
    } finally {
      clearTimeout(timer);
    }
  }

  load();
})();
