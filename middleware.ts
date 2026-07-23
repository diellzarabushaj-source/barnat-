import { next } from '@vercel/functions';
import { sessionFromRequest, verifySessionToken } from './lib/auth-edge.mjs';

const PUBLIC_PATHS = new Set([
  '/login.html',
  '/login.css',
  '/login.js',
  '/favicon.ico',
  '/robots.txt',
]);

export const config = {
  matcher: '/:path*',
};

function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || pathname === '/api/auth';
}

function safeReturnPath(url) {
  const value = `${url.pathname}${url.search}`;
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/api/') && !value.startsWith('/login')
    ? value
    : '/index.html';
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const authenticated = await verifySessionToken(sessionFromRequest(request));

  if (isPublicPath(pathname)) {
    if (pathname === '/login.html' && authenticated) {
      const target = new URL(url.searchParams.get('return') || '/', request.url);
      if (target.origin !== url.origin || target.pathname.startsWith('/api/') || target.pathname.startsWith('/login')) {
        return Response.redirect(new URL('/', request.url), 302);
      }
      return Response.redirect(target, 302);
    }
    return next();
  }

  if (authenticated) return next();

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Kërkohet autentikim.' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Vary': 'Cookie',
      },
    });
  }

  const loginUrl = new URL('/login.html', request.url);
  loginUrl.searchParams.set('return', safeReturnPath(url));
  return Response.redirect(loginUrl, 302);
}
