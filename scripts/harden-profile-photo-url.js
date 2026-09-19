'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'medindex-brand-runtime.js');
const registryPath = path.join(root, 'registry-v2.js');
const MARKER = 'profile-photo-url-guard-v1';
const VERSION = 'drx-brand-v8-profileguard1';

let runtime = fs.readFileSync(runtimePath, 'utf8').replace(/\r\n?/g, '\n');
let registry = fs.readFileSync(registryPath, 'utf8').replace(/\r\n?/g, '\n');

if (!runtime.includes(MARKER)) {
  const cleanAnchor = "  const clean = (value, max = 120) => String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, max);";
  if (!runtime.includes(cleanAnchor)) throw new Error('Profile URL guard clean() anchor missing.');
  runtime = runtime.replace(cleanAnchor, `${cleanAnchor}\n  const PROFILE_PHOTO_URL_GUARD = '${MARKER}';\n  function safeProfilePhotoUrl(value) {\n    const raw = String(value ?? '').trim();\n    if (!raw || /^(?:undefined|null|false|nan)$/i.test(raw)) return '';\n    if (/^data:image\\/(?:png|jpe?g|webp);base64,/i.test(raw)) return raw;\n    try {\n      const parsed = new URL(raw, location.origin);\n      if (parsed.origin === location.origin || parsed.protocol === 'https:') return parsed.href;\n    } catch {}\n    return '';\n  }`);

  const remoteAnchor = "      if (meta.exists && meta.url) {\n        clearLocalPhoto();\n        profile = { ...profile, photo:String(meta.url) };";
  if (!runtime.includes(remoteAnchor)) throw new Error('Profile remote-photo anchor missing.');
  runtime = runtime.replace(remoteAnchor, "      const remotePhoto = safeProfilePhotoUrl(meta?.url);\n      if (meta.exists && remotePhoto) {\n        clearLocalPhoto();\n        profile = { ...profile, photo:remotePhoto };");

  runtime = runtime.replaceAll(
    "    profile = { ...profile, photo:String(saved.url || '') };",
    "    profile = { ...profile, photo:safeProfilePhotoUrl(saved?.url) };"
  );

  const avatarPattern = /  function setAvatar\(node\) \{\n    if \(!node\) return;\n[\s\S]*?\n  \}\n\n  function applyProfile\(\) \{/;
  if (!avatarPattern.test(runtime)) throw new Error('Profile avatar function anchor missing.');
  runtime = runtime.replace(avatarPattern, `  function setAvatar(node) {
    if (!node) return;
    const photo = safeProfilePhotoUrl(profile.photo);
    node.dataset.hasPhoto = String(Boolean(photo));
    node.style.backgroundImage = photo ? \`url("\${photo}")\` : '';
    node.textContent = photo ? '' : initials(profile.name);
  }

  function applyProfile() {`);

  runtime = runtime.replace("const VERSION = 'drx-brand-v7';", `const VERSION = '${VERSION}';`);
  fs.writeFileSync(runtimePath, runtime, 'utf8');
}

registry = registry.replaceAll('/medindex-brand-runtime.js?v=drx-brand-v7', `/medindex-brand-runtime.js?v=${VERSION}`);
fs.writeFileSync(registryPath, registry, 'utf8');

const otherBrandRuntimeConsumers = [
  'classification-v2.js',
  'icd-v2.js',
  'dozologjia-v2.js',
  'protokollet-v2.js',
  'urgjencat-v2.js',
  'recetat-v2.js',
  'analizat-v2.js',
  'medical-hub-v2.js',
  'sistemi-v2.js',
];
for (const relativePath of otherBrandRuntimeConsumers) {
  const consumerPath = path.join(root, relativePath);
  let consumer = fs.readFileSync(consumerPath, 'utf8').replace(/\r\n?/g, '\n');
  consumer = consumer.replaceAll(
    '/medindex-brand-runtime.js?v=drx-brand-v7',
    `/medindex-brand-runtime.js?v=${VERSION}`
  );
  if (!consumer.includes(`/medindex-brand-runtime.js?v=${VERSION}`)) {
    throw new Error(`${relativePath}: brand runtime version was not materialized.`);
  }
  fs.writeFileSync(consumerPath, consumer, 'utf8');
}

if (!runtime.includes(MARKER) || !runtime.includes('safeProfilePhotoUrl(meta?.url)') || !runtime.includes('const photo = safeProfilePhotoUrl(profile.photo);')) {
  throw new Error('Profile photo URL guard was not materialized.');
}

console.log('Hardened profile photo URLs: invalid/undefined values no longer create asset requests.');
