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

  const avatarLines = [
    "    node.dataset.hasPhoto = String(Boolean(profile.photo));",
    "    node.style.backgroundImage = profile.photo ? `url(\\\"${profile.photo}\\\")` : '';",
    "    node.textContent = profile.photo ? '' : initials(profile.name);",
  ];
  if (!avatarLines.every(line => runtime.includes(line))) {
    throw new Error('Profile avatar render lines missing.');
  }
  runtime = runtime
    .replace(avatarLines[0], "    const photo = safeProfilePhotoUrl(profile.photo);\n    node.dataset.hasPhoto = String(Boolean(photo));")
    .replace(avatarLines[1], "    node.style.backgroundImage = photo ? `url(\\\"${photo}\\\")` : '';")
    .replace(avatarLines[2], "    node.textContent = photo ? '' : initials(profile.name);");

  runtime = runtime.replace("const VERSION = 'drx-brand-v7';", `const VERSION = '${VERSION}';`);
  fs.writeFileSync(runtimePath, runtime, 'utf8');
}

registry = registry.replaceAll('/medindex-brand-runtime.js?v=drx-brand-v7', `/medindex-brand-runtime.js?v=${VERSION}`);
fs.writeFileSync(registryPath, registry, 'utf8');

if (!runtime.includes(MARKER) || !runtime.includes('safeProfilePhotoUrl(meta?.url)') || !runtime.includes('const photo = safeProfilePhotoUrl(profile.photo);')) {
  throw new Error('Profile photo URL guard was not materialized.');
}

console.log('Hardened profile photo URLs: invalid/undefined values no longer create asset requests.');
