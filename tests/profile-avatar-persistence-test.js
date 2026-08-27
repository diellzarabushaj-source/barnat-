'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const avatar = require('../lib/profile-avatar.js');

const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0xff,0xd9]);
const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
assert.deepEqual(avatar._test.decodeAvatar(dataUrl), jpeg);
assert.throws(() => avatar._test.decodeAvatar('data:image/png;base64,iVBORw0KGgo='), /JPEG/);
assert.equal(
  avatar._test.avatarPath('474a3383-35f7-4b36-93e1-884757a9b93d'),
  '474a3383-35f7-4b36-93e1-884757a9b93d/avatar.jpg',
);
assert.equal(avatar._test.trustedRemoteAvatar('https://lh3.googleusercontent.com/a/example'), true);
assert.equal(avatar._test.trustedRemoteAvatar('https://example.com/avatar.jpg'), false);

const runtime = read('medindex-brand-runtime.js');
const authApi = read('api/auth.js');
const vercel = JSON.parse(read('vercel.json'));
const migration = read('supabase/migrations/20260827111357_native_user_notes_and_profile_avatars.sql');

assert.match(authApi, /require\('\.\.\/lib\/profile-avatar\.js'\)/);
assert.match(authApi, /profilePhotoRequested/);
assert.match(authApi, /ProfileAvatar\.handle\(req, res\)/);
assert.ok(vercel.rewrites.some(item => item.source === '/api/profile-photo' && item.destination === '/api/auth?scope=profile-photo'));
assert.equal(fs.existsSync(path.join(ROOT, 'api/profile-photo.js')), false, 'profile photo must reuse api/auth.js to stay within the Vercel Hobby function budget');
assert.match(runtime, /PROFILE_API = '\/api\/profile-photo'/);
assert.match(runtime, /syncRemotePhoto/);
assert.match(runtime, /persistPhoto/);
assert.match(runtime, /removePhoto/);
assert.doesNotMatch(runtime, /Fotografia ruhet vetëm në këtë shfletues/);
assert.match(migration, /'profile-avatars'/);
assert.match(migration, /false,\s*1048576,/s);

console.log('Persistent Supabase profile-avatar contract passed.');
