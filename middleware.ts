import { next, rewrite } from '@vercel/functions';
import { sessionFromRequest, verifySessionToken } from './lib/auth.mjs';

const PUBLIC_PATHS = new Set([
  '/login.html',
  '/login.css',
  '/login.js',
  '/favicon.ico',
  '/robots.txt',
]);

export const config = {
  runtime: 'nodejs',
  matcher: '/:path*',
};

function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || pathname === '/api/auth';
}

export default function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const authenticated = verifySessionToken(sessionFromRequest(request));

  if (isPublicPath(pathname)) {
    if (pathname === '/login.html' && authenticated) {
      return Response.redirect(new URL('/', request.url), 302);
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
      },
    });
  }

  const loginUrl = new URL('/login.html', request.url);
  const response = rewrite(loginUrl);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
}
