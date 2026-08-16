(() => {
  'use strict';

  const listView = document.getElementById('blogListView');
  const grid = document.getElementById('blogGrid');
  const articleView = document.getElementById('blogArticleView');
  const statusView = document.getElementById('blogStatus');
  const API_URL = '/api/clinical-editor?blog=1';
  const AUTHOR_IMAGE = 'images/brand/diellza-portret.webp';

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function formatDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('sq-AL', {
        day: 'numeric', month: 'long', year: 'numeric'
      }).format(new Date(value));
    } catch (_) {
      return '';
    }
  }

  function setMeta(name, content) {
    if (!content) return;
    let node = document.querySelector(`meta[name="${name}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute('name', name);
      document.head.appendChild(node);
    }
    node.setAttribute('content', content);
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-cache',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      return payload;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function showStatus(title, message) {
    statusView.hidden = false;
    statusView.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>`;
  }

  function hideStatus() {
    statusView.hidden = true;
    statusView.innerHTML = '';
  }

  function renderCard(post) {
    const title = escapeHtml(post.title);
    const slug = encodeURIComponent(post.slug || '');
    const category = escapeHtml(post.category || 'Blog');
    const excerpt = escapeHtml(post.excerpt || '');
    const author = escapeHtml(post.author?.name || 'Dr. Diellza Rabushaj');
    const reading = Number(post.readingTimeMinutes) > 0 ? `${Number(post.readingTimeMinutes)} min lexim` : '';
    const date = formatDate(post.publishedAt);

    return `
      <article class="blog-card">
        <div class="blog-card__top">
          <span class="blog-card__category">${category}</span>
          <span class="blog-card__time">${escapeHtml(reading)}</span>
        </div>
        <h2><a href="blog.html?slug=${slug}">${title}</a></h2>
        <p class="blog-card__excerpt">${excerpt}</p>
        <div class="blog-card__footer">
          <div class="blog-card__author">
            <img class="blog-card__avatar" src="${AUTHOR_IMAGE}" alt="" width="38" height="38" loading="lazy" decoding="async">
            <span class="blog-card__author-copy">
              <span class="blog-card__author-name">${author}</span>
              <span class="blog-card__date">${escapeHtml(date)}</span>
            </span>
          </div>
          <a class="blog-card__link" href="blog.html?slug=${slug}" aria-label="Lexo ${title}">Lexo <span aria-hidden="true">→</span></a>
        </div>
      </article>`;
  }

  function blockText(block) {
    return Array.isArray(block?.children)
      ? block.children.map((child) => child?.text || '').join('')
      : '';
  }

  function renderPortableText(blocks) {
    if (!Array.isArray(blocks)) return '';
    return blocks.map((block) => {
      if (!block || block._type !== 'block') return '';
      const text = escapeHtml(blockText(block));
      if (!text) return '';
      switch (block.style) {
        case 'h2': return `<h2>${text}</h2>`;
        case 'h3': return `<h3>${text}</h3>`;
        case 'blockquote': return `<blockquote>${text}</blockquote>`;
        default: return `<p>${text}</p>`;
      }
    }).join('');
  }

  function renderArticle(post) {
    const title = escapeHtml(post.title || 'Artikull');
    const excerpt = escapeHtml(post.excerpt || '');
    const category = escapeHtml(post.category || 'Blog');
    const author = escapeHtml(post.author?.name || 'Dr. Diellza Rabushaj');
    const role = escapeHtml(post.author?.role || 'Mjeke');
    const bio = escapeHtml(post.author?.bio || 'Përmbajtje profesionale për praktikën klinike dhe teknologjinë në shëndetësi.');
    const reading = Number(post.readingTimeMinutes) > 0 ? `${Number(post.readingTimeMinutes)} min lexim` : '';
    const date = formatDate(post.publishedAt);
    const tags = Array.isArray(post.tags) ? post.tags : [];

    document.title = `${post.seoTitle || post.title} | MedIndex`;
    setMeta('description', post.seoDescription || post.excerpt || 'Blogu i MedIndex.');

    const heroTitle = document.getElementById('pageTitle');
    const heroLead = document.querySelector('.info-main .info-lead');
    const heroKicker = document.querySelector('.info-main .info-kicker');
    if (heroTitle) heroTitle.textContent = 'Blogu MedIndex';
    if (heroLead) heroLead.textContent = 'Përmbajtje profesionale, e shkruar për përdorim praktik dhe lexim të qartë.';
    if (heroKicker) heroKicker.textContent = 'Artikull';

    listView.hidden = true;
    articleView.hidden = false;
    articleView.innerHTML = `
      <a class="blog-article__back" href="blog.html">← Kthehu te blogu</a>
      <div class="blog-article__eyebrow">
        <span class="blog-article__category">${category}</span>
        <span class="blog-article__meta">${escapeHtml([date, reading].filter(Boolean).join(' · '))}</span>
      </div>
      <h1 class="blog-article__title">${title}</h1>
      ${excerpt ? `<p class="blog-article__lede">${excerpt}</p>` : ''}
      <div class="blog-article__byline">
        <img src="${AUTHOR_IMAGE}" alt="" width="48" height="48" decoding="async">
        <div><strong>${author}</strong><span>${role}</span></div>
      </div>
      <div class="blog-article__body">${renderPortableText(post.body)}</div>
      ${tags.length ? `<div class="blog-article__tags">${tags.map((tag) => `<span class="blog-article__tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      <aside class="blog-author-box" aria-label="Rreth autores">
        <img src="${AUTHOR_IMAGE}" alt="" width="68" height="68" loading="lazy" decoding="async">
        <div><strong>${author}</strong><p>${bio}</p></div>
      </aside>`;
  }

  async function loadList() {
    document.title = 'Blog | MedIndex';
    setMeta('description', 'Blogu i MedIndex për praktikë klinike, Clinical Decision Support, teknologji shëndetësore dhe përdorim të sigurt të informacionit.');
    showStatus('Duke ngarkuar artikujt…', 'Përmbajtja po merret nga MedIndex Clinical Knowledge.');
    try {
      const payload = await fetchJson(API_URL);
      const posts = Array.isArray(payload.posts) ? payload.posts : [];
      hideStatus();
      if (!posts.length) {
        showStatus('Nuk ka artikuj të publikuar ende.', 'Kontrollo përsëri së shpejti.');
        return;
      }
      grid.innerHTML = posts.map(renderCard).join('');
    } catch (error) {
      console.error('[blog]', error);
      showStatus('Artikujt nuk mund të ngarkohen për momentin.', 'Provo ta rifreskosh faqen pas pak.');
    }
  }

  async function loadArticle(slug) {
    showStatus('Duke hapur artikullin…', 'Përmbajtja po ngarkohet.');
    try {
      const payload = await fetchJson(`${API_URL}&slug=${encodeURIComponent(slug)}`);
      hideStatus();
      renderArticle(payload.post);
    } catch (error) {
      console.error('[blog-detail]', error);
      listView.hidden = false;
      articleView.hidden = true;
      showStatus('Artikulli nuk u gjet.', 'Kthehu te blogu dhe zgjidh një artikull tjetër.');
    }
  }

  const slug = new URLSearchParams(window.location.search).get('slug');
  if (slug) loadArticle(slug);
  else loadList();
})();
