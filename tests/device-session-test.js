'use strict';
const assert = require('node:assert/strict');
const F = require('./device-session-fixture.js');

(async () => {
  const { auth, Device } = await F.modules();
  const realNow = Date.now.bind(Date);
  let offset = 0;
  Date.now = () => realNow() + offset;
  let cookie = F.applyCookies('', await F.call());
  const login = await F.call('POST', { email:F.email, password:'Test-password-2026!' }, cookie);
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.deviceRemembered, true);
  cookie = F.applyCookies(cookie, login);
  const rawDevice = Device.deviceFromRequest({ headers:{ cookie } });
  const device = Device.deviceData(rawDevice);
  assert.equal(device.authUid, F.id);
  assert.ok(!rawDevice.includes('refresh-test') && !rawDevice.includes(F.email), 'Credential must be encrypted.');
  const changed = rawDevice.slice(0, 30) + (rawDevice[30] === 'A' ? 'B' : 'A') + rawDevice.slice(31);
  assert.equal(Device.deviceData(changed), null, 'Tampering must fail closed.');
  assert.equal(Device.deviceData(rawDevice, realNow() + (Device.DEVICE_TTL_SECONDS + 1) * 1000), null);
  assert.equal(auth.verifySessionToken(auth.sessionFromRequest({ headers:{ cookie } }), realNow() + 9 * 3600000), false,
    'The short access session must still expire; persistence must use refresh validation.');
  const deviceHeader = login.headers['set-cookie'].find(x => x.startsWith('medindex_device='));
  assert.match(deviceHeader, /Max-Age=7776000; HttpOnly; Secure; SameSite=Strict/);
  assert.doesNotMatch(JSON.stringify(login.body), /refresh-test|access-test/, 'No upstream credentials in the response body.');

  offset = 9 * 3600000;
  const renewed = await F.call('GET', undefined, cookie);
  assert.equal(renewed.body.authenticated, true);
  assert.equal(renewed.body.authUser.id, F.id);
  cookie = F.applyCookies(cookie, renewed);
  assert.notEqual(Device.deviceFromRequest({ headers:{ cookie } }), rawDevice, 'Refresh rotation must replace the encrypted cookie.');
  const count = F.state.refreshes;
  assert.equal((await F.call('GET', undefined, cookie)).body.authenticated, true);
  assert.equal(F.state.refreshes, count, 'Fresh sessions must not rotate on every page read.');
  assert.equal((await F.call('GET', undefined, cookie, '?resume=1&return=%2Frecetat.html%3Fid%3Ddemo')).headers.location,
    '/recetat.html?id=demo');
  for (const unsafe of ['//evil.test', '/\\evil.test', '/api/auth?resume=1', '/login.html', '/%2e%2e/api/auth', '/\n/evil.test']) {
    assert.equal(Device.safeResumePath(unsafe), '/index.html', unsafe);
  }

  offset += 9 * 3600000;
  F.state.transient = true;
  const outage = await F.call('GET', undefined, cookie);
  assert.equal(outage.statusCode, 503);
  assert.equal(outage.headers['set-cookie'], undefined, 'An outage must not clear the remembered credential.');
  F.state.transient = false;
  const recovered = await F.call('GET', undefined, cookie);
  assert.equal(recovered.body.authenticated, true);
  cookie = F.applyCookies(cookie, recovered);

  offset += 9 * 3600000;
  F.state.status = 'suspended';
  const blocked = await F.call('GET', undefined, cookie);
  assert.equal(blocked.body.authenticated, false, 'A suspended doctor may not renew.');
  assert.match(blocked.headers['set-cookie'].join(';'), /medindex_device=; Path=\/; Max-Age=0;/);
  F.state.status = 'active';
  F.state.storeDisabled = true;
  assert.equal((await F.call('GET', undefined, cookie)).body.authenticated, false,
    'Legacy user-store disablement must also revoke the remembered device.');
  F.state.storeDisabled = false;

  cookie = F.applyCookies('', await F.call());
  const google = await F.call('POST', { credential:'test-google-credential' }, cookie);
  assert.equal(google.body.deviceRemembered, true, 'Google and email must both remember the browser.');
  cookie = F.applyCookies(cookie, google);
  offset += 9 * 3600000;
  F.state.mismatch = true;
  const mismatch = await F.call('GET', undefined, cookie);
  assert.equal(mismatch.body.authenticated, false, 'Renewal must never change account identity.');
  F.state.mismatch = false;

  cookie = F.applyCookies('', await F.call());
  cookie = F.applyCookies(cookie, await F.call('POST', { email:F.email, password:'Test-password-2026!' }, cookie));
  const logout = await F.call('DELETE', undefined, cookie);
  assert.equal(logout.statusCode, 200);
  assert.equal(F.state.logouts, 1, 'Logout must revoke this upstream session only.');
  cookie = F.applyCookies(cookie, logout);
  assert.equal(Device.deviceFromRequest({ headers:{ cookie } }), '');
  assert.equal((await F.call('GET', undefined, cookie)).body.authenticated, false);

  cookie = F.applyCookies('', await F.call());
  const fallback = await F.call('POST', { password:'device-test-fallback' }, cookie);
  assert.equal(fallback.body.deviceRemembered, true);
  cookie = F.applyCookies(cookie, fallback);
  offset += 9 * 3600000;
  assert.equal((await F.call('GET', undefined, cookie)).body.authenticated, true, 'Owner fallback also remembers this browser.');
  process.env.ACCESS_CODE = 'changed-code';
  assert.equal(Device.deviceData(Device.deviceFromRequest({ headers:{ cookie } })), null,
    'Changing the fallback password revokes its remembered devices.');

  const middleware = await F.middleware();
  const forged = await middleware(new Request('https://drx.test/recetat.html', { headers:{ cookie:'medindex_device=forged' } }));
  assert.equal(forged.status, 302);
  assert.ok(new URL(forged.headers.get('location')).pathname === '/api/auth', 'Cookie presence must require server verification.');
  assert.equal(forged.headers.get('x-test-next'), null, 'A device cookie alone must not authorize protected HTML.');
  const deniedApi = await middleware(new Request('https://drx.test/api/registry', { headers:{ cookie:'medindex_device=forged' } }));
  assert.equal(deniedApi.status, 401, 'Device cookies must never bypass API authorization.');
  const invalidResume = await F.call('GET', undefined, 'medindex_device=forged', '?resume=1&return=%2Frecetat.html');
  assert.equal(invalidResume.statusCode, 302);
  assert.ok(invalidResume.headers.location.startsWith('/landing.html'));
  Date.now = realNow;
  console.log('Remembered device security passed: encrypted cookies, expiry, Google/email/fallback renewal, rotation, outage recovery, account gating, identity binding, logout and edge authorization.');
})().catch(error => { console.error(error); process.exitCode = 1; });
