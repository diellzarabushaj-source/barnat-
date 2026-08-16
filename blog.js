(() => {
  'use strict';

  const listView = document.getElementById('blogListView');
  const grid = document.getElementById('blogGrid');
  const articleView = document.getElementById('blogArticleView');
  const statusView = document.getElementById('blogStatus');
  const articleCount = document.getElementById('blogArticleCount');
  const readingProgress = document.getElementById('blogReadingProgress');
  const API_URL = '/api/clinical-editor?blog=1';
  const AUTHOR_IMAGE = 'images/brand/diellza-portret.webp';

  const FALLBACK_COVERS = Object.freeze({
    clinical: {
      url: 'https://images.unsplash.com/photo-1758691463620-188ca7c1a04f?auto=format&fit=crop&w=1800&q=84',
      alt: 'Mjek duke zhvilluar një konsultë digjitale përmes laptopit.',
      credit: 'Vitaly Gariev · Unsplash',
    },
    technology: {
      url: 'https://images.unsplash.com/photo-1758691737643-f4ce254290af?auto=format&fit=crop&w=1800&q=84',
      alt: 'Mjek duke punuar në laptop në një ambient klinik.',
      credit: 'Vitaly Gariev · Unsplash',
    },
  });

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

  function safeImageUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value), window.location.origin);
      const allowed = url.origin === window.location.origin
        || url.origin === 'https://cdn.sanity.io'
        || url.origin === 'https://images.unsplash.com';
      return allowed && ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function safeLinkUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value), window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function fallbackCover(post) {
    const category = String(post?.category || '').toLowerCase();
    return category.includes('clinical decision') || category.includes('clinical practice')
      ? FALLBACK_COVERS.clinical
      : FALLBACK_COVERS.technology;
  }

  function coverFor(post) {
    const configured = post?.coverImage || {};
    const configuredUrl = safeImageUrl(configured.url);
    if (configuredUrl) {
      return {
        url: configuredUrl,
        alt: configured.alt || post?.title || 'MedIndex Journal',
        caption: configured.caption || '',
        credit: configured.credit || '',
      };
    }
    return { ...fallbackCover(post), caption: '' };
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

  function renderCard(post, index) {
    const title = escapeHtml(post.title);
    const slug = encodeURIComponent(post.slug || '');
    const category = escapeHtml(post.category || 'Blog');
    const excerpt = escapeHtml(post.excerpt || '');
    const author = escapeHtml(post.author?.name || 'Dr. Diellza Rabushaj');
    const reading = Number(post.readingTimeMinutes) > 0 ? `${Number(post.readingTimeMinutes)} min lexim` : '';
    const date = formatDate(post.publishedAt);
    const cover = coverFor(post);
    const featured = index === 0;

    return `
      <article class="blog-card${featured ? ' blog-card--featured' : ''}">
        <a class="blog-card__media" href="blog.html?slug=${slug}" aria-label="Lexo ${title}">
          <img src="${escapeHtml(cover.url)}" alt="${escapeHtml(cover.alt)}" width="1200" height="760" ${featured ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
          <span class="blog-card__media-overlay" aria-hidden="true"></span>
          ${featured ? '<span class="blog-card__feature-label">Zgjedhja e redaksisë</span>' : ''}
          ${cover.credit ? `<span class="blog-card__credit">${escapeHtml(cover.credit)}</span>` : ''}
        </a>
        <div class="blog-card__content">
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
            <a class="blog-card__link" href="blog.html?slug=${slug}" aria-label="Lexo ${title}">Lexo artikullin <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </article>`;
  }

  function renderSpan(child, block) {
    let html = escapeHtml(child?.text || '');
    const marks = Array.isArray(child?.marks) ? child.marks : [];
    const markDefs = Array.isArray(block?.markDefs) ? block.markDefs : [];

    marks.forEach((mark) => {
      if (mark === 'strong') html = `<strong>${html}</strong>`;
      else if (mark === 'em') html = `<em>${html}</em>`;
      else if (mark === 'code') html = `<code>${html}</code>`;
      else if (mark === 'underline') html = `<u>${html}</u>`;
      else if (mark === 'strike-through') html = `<s>${html}</s>`;
      else {
        const def = markDefs.find((item) => item?._key === mark);
        const href = safeLinkUrl(def?.href);
        if (href) html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${html}</a>`;
      }
    });
    return html;
  }

  function blockHtml(block) {
    const text = Array.isArray(block?.children)
      ? block.children.map((child) => renderSpan(child, block)).join('')
      : '';
    if (!text) return '';
    switch (block.style) {
      case 'h1':
      case 'h2': return `<h2>${text}</h2>`;
      case 'h3': return `<h3>${text}</h3>`;
      case 'h4': return `<h4>${text}</h4>`;
      case 'blockquote': return `<blockquote>${text}</blockquote>`;
      default: return `<p>${text}</p>`;
    }
  }

  function renderPortableText(blocks) {
    if (!Array.isArray(blocks)) return '';
    let html = '';
    let openList = '';

    blocks.forEach((block) => {
      if (!block || block._type !== 'block') return;
      if (block.listItem) {
        const list = block.listItem === 'number' ? 'ol' : 'ul';
        if (openList !== list) {
          if (openList) html += `</${openList}>`;
          html += `<${list}>`;
          openList = list;
        }
        const content = Array.isArray(block.children)
          ? block.children.map((child) => renderSpan(child, block)).join('')
          : '';
        if (content) html += `<li>${content}</li>`;
        return;
      }

      if (openList) {
        html += `</${openList}>`;
        openList = '';
      }
      html += blockHtml(block);
    });

    if (openList) html += `</${openList}>`;
    return html;
  }

  let progressBound = false;
  function setupReadingProgress() {
    if (!readingProgress) return;
    readingProgress.hidden = false;
    const bar = readingProgress.querySelector('span');
    const update = () => {
      if (!bar || articleView.hidden) return;
      const top = articleView.getBoundingClientRect().top + window.scrollY;
      const distance = Math.max(articleView.offsetHeight - window.innerHeight * 0.55, 1);
      const value = Math.max(0, Math.min(1, (window.scrollY - top + 110) / distance));
      bar.style.transform = `scaleX(${value})`;
    };
    if (!progressBound) {
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update, { passive: true });
      progressBound = true;
    }
    update();
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
    const cover = coverFor(post);
    const figureCaption = [cover.caption, cover.credit].filter(Boolean).join(' · ');

    document.title = `${post.seoTitle || post.title} | MedIndex Journal`;
    setMeta('description', post.seoDescription || post.excerpt || 'MedIndex Journal.');

    const heroTitle = document.getElementById('pageTitle');
    const heroLead = document.querySelector('.info-main .info-lead');
    const heroKicker = document.querySelector('.info-main .info-kicker');
    const heroBadge = document.querySelector('.blog-hero__badge');
    const heroFacts = document.querySelector('.blog-hero__facts');
    if (heroTitle) heroTitle.textContent = 'MedIndex Journal';
    if (heroLead) heroLead.textContent = 'Lexim klinik i qartë, me fokus te ajo që ka rëndësi në praktikë.';
    if (heroKicker) heroKicker.textContent = 'Artikull';
    if (heroBadge) heroBadge.hidden = true;
    if (heroFacts) heroFacts.hidden = true;

    listView.hidden = true;
    articleView.hidden = false;
    articleView.innerHTML = `
      <a class="blog-article__back" href="blog.html"><span aria-hidden="true">←</span> Kthehu te Journal</a>
      <div class="blog-article__eyebrow">
        <span class="blog-article__category">${category}</span>
        <span class="blog-article__meta">${escapeHtml([date, reading].filter(Boolean).join(' · '))}</span>
      </div>
      <h1 class="blog-article__title">${title}</h1>
      ${excerpt ? `<p class="blog-article__lede">${excerpt}</p>` : ''}
      <div class="blog-article__byline">
        <img src="${AUTHOR_IMAGE}" alt="" width="48" height="48" decoding="async">
        <div><strong>${author}</strong><span>${role}</span></div>
        <span class="blog-article__verified">MedIndex editorial</span>
      </div>
      <figure class="blog-article__hero-image">
        <img src="${escapeHtml(cover.url)}" alt="${escapeHtml(cover.alt)}" width="1600" height="920" fetchpriority="high" decoding="async">
        ${figureCaption ? `<figcaption>${escapeHtml(figureCaption)}</figcaption>` : ''}
      </figure>
      <div class="blog-article__body">${renderPortableText(post.body)}</div>
      ${tags.length ? `<div class="blog-article__tags">${tags.map((tag) => `<span class="blog-article__tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      <aside class="blog-author-box" aria-label="Rreth autores">
        <img src="${AUTHOR_IMAGE}" alt="" width="68" height="68" loading="lazy" decoding="async">
        <div><span class="blog-author-box__eyebrow">Rreth autores</span><strong>${author}</strong><p>${bio}</p></div>
      </aside>
      <div class="blog-article__end">
        <span>MedIndex Journal</span>
        <a href="blog.html">Shiko të gjithë artikujt <b aria-hidden="true">→</b></a>
      </div>`;
    setupReadingProgress();
  }

  async function loadList() {
    document.title = 'MedIndex Journal | Blog';
    setMeta('description', 'MedIndex Journal — analiza klinike, Clinical Decision Support, inteligjencë artificiale dhe teknologji shëndetësore për praktikë më të qartë.');
    if (readingProgress) readingProgress.hidden = true;
    showStatus('Duke ngarkuar artikujt…', 'Përmbajtja po merret nga MedIndex Clinical Knowledge.');
    try {
      const payload = await fetchJson(API_URL);
      const posts = Array.isArray(payload.posts) ? payload.posts : [];
      if (articleCount) articleCount.textContent = String(posts.length);
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
      if (readingProgress) readingProgress.hidden = true;
      showStatus('Artikulli nuk u gjet.', 'Kthehu te blogu dhe zgjidh një artikull tjetër.');
    }
  }

  const slug = new URLSearchParams(window.location.search).get('slug');
  if (slug) loadArticle(slug);
  else loadList();
})();
