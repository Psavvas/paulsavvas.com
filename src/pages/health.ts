import type { APIRoute } from 'astro';

// Availability probe for uptime monitors. Deliberately does not import the
// content layer or open a database connection. This checks the web runtime,
// not database health; public page rendering remains a separate check.
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: 'ok' }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export const HEAD: APIRoute = () =>
  new Response(null, {
    headers: { 'Cache-Control': 'no-store' },
  });
