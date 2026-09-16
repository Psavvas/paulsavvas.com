import { defineMiddleware } from 'astro:middleware';
import { getAdminSession } from './lib/auth';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);

/** Methods that can't change server state, and so need no origin check. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Public pages are database-backed, but they do not contain per-user data.
// Let Vercel's CDN serve the same rendered response for a short period instead
// of invoking a serverless function (and Neon) for every browser or crawler
// request. Edits remain effectively immediate while the database avoids the
// much more expensive "query on every page view" pattern.
const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

function normalize(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/**
 * The origin a state-changing /admin request has to come from.
 *
 * Prefers BETTER_AUTH_URL, because the request's own origin is derived from the
 * Host header and is attacker-controlled on any hostname that resolves here
 * (notably the *.vercel.app deployment URL). Falling back to it still blocks
 * the ordinary cross-site POST, which is what this check is for.
 */
function expectedOrigin(requestOrigin: string): string {
  const pinned = process.env.BETTER_AUTH_URL?.trim();
  if (!pinned) return requestOrigin;

  try {
    return new URL(pinned).origin;
  } catch {
    return requestOrigin;
  }
}

function forbidden(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = normalize(context.url.pathname);

  if (!pathname.startsWith('/admin')) {
    const response = await next();

    const cacheControl = response.headers
      .get('Cache-Control')
      ?.trim()
      .toLowerCase();

    if (
      SAFE_METHODS.has(context.request.method) &&
      (!cacheControl || cacheControl === 'public')
    ) {
      response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL);
    }

    return response;
  }

  // Every admin mutation is a plain HTML form calling the database directly, so
  // none of them pass through Better Auth's own origin check. Without this the
  // only thing standing between a cross-site POST and a live content change is
  // the session cookie's SameSite default.
  if (!SAFE_METHODS.has(context.request.method)) {
    const origin = context.request.headers.get('origin');

    if (!origin || origin !== expectedOrigin(context.url.origin)) {
      return forbidden('Cross-origin request rejected.');
    }
  }

  const session = await getAdminSession(context.request);
  context.locals.admin = session;

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    if (session && context.request.method === 'GET') {
      return context.redirect('/admin');
    }
    return next();
  }

  if (!session) {
    if (pathname.startsWith('/admin/api/')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Only worth resuming a GET. A POST can't be replayed after login, and
    // capturing one sends the user somewhere useless afterwards — signing out
    // while already signed out would land them on /admin/logout's 405.
    const resume =
      context.request.method === 'GET'
        ? `?next=${encodeURIComponent(pathname)}`
        : '';

    return context.redirect(`/admin/login${resume}`);
  }

  return next();
});
