# Remembered browser sessions

Normal Google and email sign-in now save a server-set `medindex_device` cookie.
It contains an AES-256-GCM encrypted Supabase refresh token and the approved
account/storage identity. It is HttpOnly, Secure, SameSite=Lax and expires
after 90 days without successful renewal. Each renewal rotates the credential
and the cookie. Passwords and upstream access/refresh tokens are never returned
to browser JavaScript or saved in Web Storage.

The Lax login cookies are included on safe top-level navigation, so returning
from an external link does not look signed out. The CSRF cookie remains Strict;
unsafe requests retain their origin and CSRF checks. Existing remembered cookies
are reissued during a successful session check without rotating healthy upstream
credentials. The public entry page resumes a remembered browser automatically,
including old Strict cookies recovered by a same-origin check after navigation.

The signed v3 application session still expires after eight hours. Existing
sessions remain compatible. Because earlier sign-ins discarded the Supabase
refresh token, those browsers acquire persistence on their next sign-in.

When a protected page is opened after expiry, middleware redirects to
the public `/session-resume.html` page. It paints immediately and requests
`/api/auth?entry=1` in the background, so a slow renewal cannot block the document
and leave Safari blank. The cookie alone never authorizes protected HTML or APIs.
The server decrypts it, refreshes through Supabase, verifies the live user and
active doctor/admin profile, and checks both Auth UUID and storage-owner UUID
before issuing another short session. Return destinations are restricted to
local, non-authentication paths. Temporary upstream failures preserve the device
credential and retry rather than forcing another login.
The recovery page shows connection status, retries failures, preserves the local
return path and offers an explicit sign-in link that bypasses automatic resume.
Legacy `/api/auth?resume=1` links remain supported.

The shared sidebar runtime checks on return to an active tab and every 15 minutes.
An expired same-origin API GET is renewed and retried once; writes and forbidden
responses are never replayed. Renewal is serialized with logout in that tab.

The owner's explicit password fallback also remembers the browser, bound to the
configured access-code revision. Changing or disabling that configuration
invalidates its remembered credentials. It never impersonates Supabase Auth.

Logout clears both application and device cookies and revokes the current
Supabase session with `scope=local`, preserving other devices. Local cookie
clearing still completes when Supabase is unavailable. An upstream outage can
delay server-side revocation; normal short-session expiry continues to apply.

Tests cover cryptographic tampering, expiry, refresh rotation, live account
gating, identity binding, outage recovery, logout, open redirects and middleware
authorization. The browser test uses the production handler and middleware,
mocked upstream services, HTTPS and an actual persistent browser profile. It
closes/reopens the browser after nine simulated server hours, verifies external
deep links, entry-page recovery, old-cookie migration, cross-site POST rejection
and active-tab recovery, then verifies logout survives another restart. CI runs
it with Chromium and WebKit.
