'use strict';

const fs = require('fs');

function replaceOnce(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Missing ${label}`);
  return text.replace(before, after);
}

let js = fs.readFileSync('medical-hub-v2.js', 'utf8');

js = replaceOnce(
  js,
  `  function preferredChapterItem(key) {\n    const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === key) || null;\n    const lessons = chapterLessons(key);\n    return lessons.length === 1 ? lessons[0] : chapter;\n  }\n`,
  `  function preferredChapterItem(key) {\n    const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === key) || null;\n    const lessons = chapterLessons(key);\n    return lessons[0] || chapter;\n  }\n\n  function chapterCatalog() {\n    const byKey = new Map();\n    state.items.forEach(item => {\n      const key = chapterKey(item);\n      if (!key) return;\n      const existing = byKey.get(key);\n      if (isChapter(item)) {\n        byKey.set(key, {\n          key,\n          title:clean(item.title).replace(/^\\d+\\s*[—-]\\s*/, ''),\n          item,\n        });\n        return;\n      }\n      const title = clean(item.chapterTitle);\n      if (!existing) {\n        byKey.set(key, { key, title:title || \`Kapitulli \${Number(key)}\`, item });\n      } else if ((!existing.title || /^Kapitulli \\d+$/.test(existing.title)) && title) {\n        existing.title = title;\n      }\n    });\n    return [...byKey.values()].sort((a,b) => Number(a.key) - Number(b.key));\n  }\n`,
  'preferredChapterItem',
);

js = replaceOnce(
  js,
  `    const source = term ? candidates.filter(item => !isChapter(item)) : candidates;`,
  `    const source = candidates.filter(item => !isChapter(item));`,
  'chapter filtering',
);

const renderListPattern = /  function renderList\(\) \{[\s\S]*?\n  \}\n\n(?=  function renderReaderNavigation\(\))/;
if (!renderListPattern.test(js)) throw new Error('Missing renderList');
js = js.replace(renderListPattern, `  function renderList() {\n    const select = $('#learningTopic');\n    if (!select) {\n      renderNavigationRails();\n      return;\n    }\n\n    const term = clean(state.term);\n    let options = '';\n\n    if (!term && state.category) {\n      const lessons = chapterLessons(state.category);\n      options = lessons.map(item => \`<option value="\${esc(item._id)}">\${esc(codedTitle(item))}</option>\`).join('');\n    } else {\n      const grouped = new Map();\n      state.filtered.forEach(item => {\n        const key = chapterKey(item) || '00';\n        if (!grouped.has(key)) grouped.set(key, []);\n        grouped.get(key).push(item);\n      });\n      const catalog = new Map(chapterCatalog().map(entry => [entry.key, entry]));\n      options = Array.from(grouped.entries()).map(([key, items]) => {\n        const meta = catalog.get(key);\n        const label = meta ? \`Kapitulli \${Number(key)} — \${meta.title}\` : \`Kapitulli \${key}\`;\n        return \`<optgroup label="\${esc(label)}">\${items.map(item => \`<option value="\${esc(item._id)}">\${esc(codedTitle(item))}</option>\`).join('')}</optgroup>\`;\n      }).join('');\n    }\n\n    select.innerHTML = options || '<option value="">Asnjë mësim</option>';\n    select.value = state.selectedId;\n    select.disabled = !options;\n    renderNavigationRails();\n  }\n\n`);

js = replaceOnce(
  js,
  `    const chapterCount = state.items.filter(isChapter).length;\n    const lessonCount = state.items.length - chapterCount;`,
  `    const chapterCount = chapterCatalog().length;\n    const lessonCount = state.items.filter(item => !isChapter(item)).length;`,
  'reader counts',
);

js = replaceOnce(
  js,
  `      else if (state.category) {\n        const chapter = state.items.find(item => isChapter(item) && chapterKey(item) === state.category);\n        const lessonTotal = state.items.filter(item => !isChapter(item) && chapterKey(item) === state.category).length;\n        result.textContent = chapter ? \`\${lessonTotal} mësime në \${chapter.question || chapter.title}\` : \`\${state.filtered.length} rezultate\`;\n      } else result.textContent = \`\${chapterCount} kapituj · \${lessonCount} mësime · burimi i publikuar\`;`,
  `      else if (state.category) {\n        const meta = chapterCatalog().find(entry => entry.key === state.category);\n        const lessonTotal = chapterLessons(state.category).length;\n        result.textContent = meta ? \`\${lessonTotal} mësime në Kapitulli \${Number(state.category)} — \${meta.title}\` : \`\${state.filtered.length} rezultate\`;\n      } else result.textContent = \`\${chapterCount} kapituj · \${lessonCount} mësime · burimi i publikuar\`;`,
  'reader status',
);

js = replaceOnce(
  js,
  `      const chapters = state.items.filter(isChapter);\n      const category = $('#learningCategory');\n      if (category) {\n        category.innerHTML = '<option value="">Të gjithë kapitujt</option>'\n          + chapters.map(chapter => {\n            const number = chapterKey(chapter);\n            const title = clean(chapter.title).replace(/^\\d+\\s*[—-]\\s*/, '');\n            return \`<option value="\${number}">Kapitulli \${Number(number)} — \${esc(title)}</option>\`;\n          }).join('');\n      }\n\n      state.category = chapters[0] ? chapterKey(chapters[0]) : '';\n      state.selectedId = preferredChapterItem(state.category)?._id || chapters[0]?._id || state.items[0]?._id || '';`,
  `      const chapters = chapterCatalog();\n      const category = $('#learningCategory');\n      if (category) {\n        category.innerHTML = '<option value="">Të gjithë kapitujt</option>'\n          + chapters.map(chapter => \`<option value="\${chapter.key}">Kapitulli \${Number(chapter.key)} — \${esc(chapter.title)}</option>\`).join('');\n      }\n\n      state.category = chapters[0]?.key || '';\n      state.selectedId = preferredChapterItem(state.category)?._id || state.items.find(item => !isChapter(item))?._id || '';`,
  'init chapters',
);

js = replaceOnce(
  js,
  `    const firstChapter = state.items.find(isChapter) || null;\n    state.category = '';\n    state.selectedId = firstChapter?._id || state.items[0]?._id || '';`,
  `    const firstChapter = chapterCatalog()[0] || null;\n    state.category = '';\n    state.selectedId = firstChapter ? preferredChapterItem(firstChapter.key)?._id || '' : state.items.find(item => !isChapter(item))?._id || '';`,
  'clear filters',
);

fs.writeFileSync('medical-hub-v2.js', js);

let api = fs.readFileSync('api/medical-hub.js', 'utf8');
api = replaceOnce(
  api,
  `contentKind, chapterNumber, lessonNumber, reviewStatus, reviewedBy, lastReviewedAt, version, sourceRxTitle,`,
  `contentKind, chapterNumber, lessonNumber, chapterTitle, reviewStatus, reviewedBy, lastReviewedAt, version, sourceRxTitle,`,
  'legacy index projection',
);
fs.writeFileSync('api/medical-hub.js', api);
