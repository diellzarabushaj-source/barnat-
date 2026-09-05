'use strict';

const fs = require('fs');

function replaceOnce(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Missing ${label}`);
  return text.replace(before, after);
}

const path = 'medical-hub-v2.js';
let js = fs.readFileSync(path, 'utf8');

const before = `  function stepMarkup(step, index) {\n    const styleClass = stepStyleClass(step);\n    const meta = [step.setting].filter(Boolean);\n    return \`\n      <article class="ck-step \${styleClass}">\n        <span class="ck-step-number">\${String(index + 1).padStart(2, '0')}</span>\n        <div class="ck-step-copy">\n          <div class="ck-step-title">\n            <strong>\${richText(step.title || 'Hapi')}</strong>\n            \${meta.length ? \`<small>\${esc(meta.join(' · '))}</small>\` : ''}\n          </div>\n          <p>\${richText(step.action || '')}</p>\n          \${step.why ? \`<div class="ck-step-why"><span>Pse</span><p>\${richText(step.why)}</p></div>\` : ''}\n          \${step.note ? \`<small class="ck-step-note">\${richText(step.note)}</small>\` : ''}\n        </div>\n      </article>\`;\n  }\n`;

const after = `  function stepActionMarkup(value) {\n    const text = clean(value);\n    if (!text) return '';\n\n    let lead = '';\n    let listText = text;\n    const divider = text.indexOf(' — ');\n    if (divider > 0 && text.slice(divider + 3).includes(' • ')) {\n      lead = text.slice(0, divider).trim();\n      listText = text.slice(divider + 3).trim();\n    }\n\n    const items = listText.split(' • ').map(clean).filter(Boolean);\n    if (items.length < 2) return \`<p>\${richText(text)}</p>\`;\n\n    return \`\n      \${lead ? \`<p class="ck-step-lead">\${richText(lead)}</p>\` : ''}\n      <ul class="ck-master-bullets ck-step-bullets">\n        \${items.map(item => {\n          const cut = item.indexOf(':');\n          if (cut > 0 && cut < 90) {\n            return \`<li><strong>\${richText(item.slice(0, cut))}</strong><span>\${richText(item.slice(cut + 1).trim())}</span></li>\`;\n          }\n          return \`<li><span>\${richText(item)}</span></li>\`;\n        }).join('')}\n      </ul>\`;
  }\n\n  function stepMarkup(step, index) {\n    const styleClass = stepStyleClass(step);\n    const meta = [step.setting].filter(Boolean);\n    return \`\n      <article class="ck-step \${styleClass}">\n        <span class="ck-step-number">\${String(index + 1).padStart(2, '0')}</span>\n        <div class="ck-step-copy">\n          <div class="ck-step-title">\n            <strong>\${richText(step.title || 'Hapi')}</strong>\n            \${meta.length ? \`<small>\${esc(meta.join(' · '))}</small>\` : ''}\n          </div>\n          \${stepActionMarkup(step.action || '')}\n          \${step.why ? \`<div class="ck-step-why"><span>Pse</span><p>\${richText(step.why)}</p></div>\` : ''}\n          \${step.note ? \`<small class="ck-step-note">\${richText(step.note)}</small>\` : ''}\n        </div>\n      </article>\`;\n  }\n`;

js = replaceOnce(js, before, after, 'stepMarkup');
fs.writeFileSync(path, js);
