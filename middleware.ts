import { next } from '@vercel/functions';
import { sessionFromRequest, verifySessionToken } from './lib/auth-edge.mjs';

const PUBLIC_INFO_PATHS = new Set([
  '/rreth-nesh.html',
  '/kontakt.html',
  '/blog.html',
]);

// The admin console has its own sign-in page, and a sign-in page that requires a
// session is unreachable by anyone who needs it. Without these the guard sends a
// signed-out admin to /admin-login.html, which bounces straight back to the
// clinical login — the admin door could never be opened.
const ADMIN_LOGIN_PAGE = '/admin-login.html';
const ADMIN_CONSOLE_PATHS = new Set(['/admin', '/admin.html']);

const PUBLIC_PATHS = new Set([
  // Spelled out rather than referenced through ADMIN_LOGIN_PAGE so this list
  // stays greppable: every audit that checks what is public reads it literally.
  '/admin-login.html',
  '/admin-login',
  '/admin-login.css',
  // Registration is by definition reachable without a session: the person
  // filling it in does not have one yet, and will not until an admin approves.
  // Both spellings: `vercel.json` rewrites the clean URL to the file, and
  // middleware runs before that rewrite, so it sees the path the visitor typed.
  '/regjistrimi',
  '/regjistrimi.html',
  '/regjistrimi.js',
  '/registration-premium.css',
  '/auth-shell.css',
  '/login-email.css',
  '/login.html',
  '/login-v2.html',
  '/login-v2.css',
  '/login-v2.js',
  '/login-v2-canvas.js',
  '/fonts/inter-latin-variable-normal.woff2',
  // Sipërfaqet publike DRx: faqja hyrëse, Journal-i dhe format e llogarisë.
  '/landing.html',
  '/landing.css',
  '/drx-pages.css',
  '/journal.html',
  '/journal.js',
  '/hyrje.html',
  '/regjistrohu.html',
  '/brand/drx-horizontal-dark.svg',
  '/brand/drx-horizontal-white.svg',
  '/brand/drx-icon-silver.svg',
  '/brand/drx-icon-white.svg',
  '/login.css',
  '/login-editorial.css',
  '/landing-effects.css',
  '/landing-strips.js',
  '/ecg-sound.js',
  '/google-login.css',
  '/login.js',
  '/info-pages.css',
  '/medindex-tailwind-ui.css',
  '/blog.css',
  '/blog.js',
  '/blog-enhance.css',
  '/blog-enhance.js',
  '/blog-final.css',
  '/blog-final.js',
  ...PUBLIC_INFO_PATHS,
  '/theme-preload.js',
  '/tailadmin-medindex.css',
  '/recovery.html',
  '/recovery.js',
  '/sw.js',
  '/sw-resilient.js',
  '/sw-resilient-v3.js',
  '/registry-parser-worker.js',
  '/registry-parser-worker-v2.js',
  '/manifest.webmanifest',
  '/medindex-icon.svg',
  '/images/brand/medindex-mark-mplus.svg',
  '/images/brand/diellza-portret.webp',
  '/brand/medindex-mark-on-light.webp',
  '/brand/medindex-full-on-dark.png',
  '/brand/medindex-mark-on-dark.png',
  '/brand/medindex-full-on-light.png',
  '/brand/medindex-horizontal-on-light.webp',
  '/brand/medindex-horizontal-on-dark.webp',
  '/images/marketing/mjekja-ne-pune.webp',
  '/images/icons/regjistri-barnave.webp',
  '/images/icons/klasifikimi-atc.webp',
  '/images/icons/diagnozat-icd10.webp',
  '/images/icons/dozologjia-pediatrike.webp',
  '/images/icons/recetat.webp',
  '/images/icons/protokollet.webp',
  '/images/icons/analizat-laboratorike.webp',
  '/images/icons/urgjencat.webp',
  '/favicon.ico',
  '/robots.txt',
]);

const PUBLIC_SECRET_APIS = new Set([
  '/api/drive-sync',
]);

export const config = {
  matcher: '/:path*',
};

/* Faqja e hyrjes që u shërbehet vizitorëve. Origjinali mbetet i arritshëm te
   /login.html; ndryshimi i kësaj vlere e kthen atë si faqe hyrëse. */
const LOGIN_PAGE = '/login-v2.html';

/* Faqja publike ku dërgohet kushdo që nuk ka sesion. Ndryshe nga LOGIN_PAGE,
   kjo nuk hyn te LOGIN_PAGES: një vizitor i kyçur duhet të mund ta shohë faqen
   hyrëse pa u kthyer me forcë te regjistri. Duhet të përputhet me ENTRY_PAGE
   te auth-client.js. */
const ENTRY_PAGE = '/landing.html';

/* Të dyja faqet sillen njësoj kur përdoruesi është tashmë i kyçur. */
const LOGIN_PAGES = new Set(['/login.html', LOGIN_PAGE, ADMIN_LOGIN_PAGE, '/admin-login']);

function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_SECRET_APIS.has(pathname) || pathname === '/api/auth';
}

/* Blogu është publik, por ndan të njëjtin Vercel Function me editorin klinik.
   Lejohet vetëm leximi GET me flamurin e saktë `blog=1`; çdo kërkesë tjetër
   ndaj /api/clinical-editor mbetet nën autentikim. */
function isPublicBlogApi(request, url) {
  return request.method === 'GET'
    && url.pathname === '/api/clinical-editor'
    && url.searchParams.get('blog') === '1';
}

function safeReturnPath(url) {
  const value = `${url.pathname}${url.search}`;
  return value.startsWith('/')
    && !value.startsWith('//')
    && !value.startsWith('/api/')
    && !value.startsWith('/login')
    && !value.startsWith('/recovery')
    && !PUBLIC_INFO_PATHS.has(url.pathname)
    ? value
    : '/index.html';
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const authenticated = await verifySessionToken(sessionFromRequest(request));

  if (isPublicPath(pathname) || isPublicBlogApi(request, url)) {
    if (authenticated && PUBLIC_INFO_PATHS.has(pathname)) {
      return Response.redirect(new URL('/index.html', request.url), 302);
    }

    if (LOGIN_PAGES.has(pathname) && authenticated) {
      const target = new URL(url.searchParams.get('return') || '/index.html', request.url);
      if (target.origin !== url.origin
        || target.pathname.startsWith('/api/')
        || target.pathname.startsWith('/login')
        || target.pathname.startsWith('/recovery')
        || PUBLIC_INFO_PATHS.has(target.pathname)) {
        return Response.redirect(new URL('/index.html', request.url), 302);
      }
      return Response.redirect(target, 302);
    }
    return next();
  }

  if (authenticated) return next();

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error:'Kërkohet autentikim.' }), {
      status:401,
      headers:{
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff',
        'Vary':'Cookie',
      },
    });
  }

  // Someone reaching for the admin console is sent to the admin sign-in, not the
  // clinical one, so the page they land on is the page they were trying to use.
  const loginUrl = new URL(ADMIN_CONSOLE_PATHS.has(pathname) ? ADMIN_LOGIN_PAGE : ENTRY_PAGE, request.url);
  loginUrl.searchParams.set('return', safeReturnPath(url));
  return Response.redirect(loginUrl, 302);
}
