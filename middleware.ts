import { next } from '@vercel/functions';
import { sessionFromRequest, verifySessionToken } from './lib/auth-edge.mjs';

const PUBLIC_INFO_PATHS = new Set([
  '/rreth-nesh.html',
  '/kontakt.html',
  '/blog.html',
]);

const PUBLIC_PATHS = new Set([
  '/login.html',
  '/login-v2.html',
  '/login-v2.css',
  '/login-v2.js',
  '/login-v2-canvas.js',
  '/fonts/inter-latin-variable-normal.woff2',
  '/login.css',
  '/login-editorial.css',
  '/landing-effects.css',
  '/landing-strips.js',
  '/ecg-sound.js',
  '/google-login.css',
  '/login.js',
  '/info-pages.css',
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
  '/images/brand/diellza-avatar.svg',
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

/* Të dyja faqet sillen njësoj kur përdoruesi është tashmë i kyçur. */
const LOGIN_PAGES = new Set(['/login.html', LOGIN_PAGE]);

function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_SECRET_APIS.has(pathname) || pathname === '/api/auth';
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

  if (isPublicPath(pathname)) {
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

  const loginUrl = new URL(LOGIN_PAGE, request.url);
  loginUrl.searchParams.set('return', safeReturnPath(url));
  return Response.redirect(loginUrl, 302);
}
