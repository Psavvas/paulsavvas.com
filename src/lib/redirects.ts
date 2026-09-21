import { getSql } from './db';

export interface RedirectRecord {
  id: string;
  slug: string;
  destination: string;
}

function normalizeSlug(rawSlug: string): string {
  return rawSlug.trim().replace(/^\/+/, '').toLowerCase();
}

export function normalizeDestination(rawUrl: string): string {
  const url = rawUrl.trim();
  if (!url) return '';

  if (url.startsWith('/')) {
    return url;
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) {
    return url;
  }

  return `https://${url}`;
}

export async function getRedirectDestination(
  rawSlug: string
): Promise<string | undefined> {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return undefined;

  // Never throws: an unreachable database sends visitors to /404 instead of
  // returning a 500.
  try {
    const sql = getSql();
    const rows = await sql`
      select destination from redirects where slug = ${slug} limit 1
    `;

    if (rows.length === 0) return undefined;

    const destination = normalizeDestination(rows[0].destination ?? '');
    return destination || undefined;
  } catch (error) {
    console.error('Failed to load redirect from the database.', error);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Admin portal queries
// ---------------------------------------------------------------------------

export async function adminListRedirects(): Promise<RedirectRecord[]> {
  const sql = getSql();
  const rows = await sql`
    select id, slug, destination from redirects order by slug asc
  `;
  return rows.map((row: any) => ({
    id: row.id,
    slug: row.slug,
    destination: row.destination,
  }));
}

export async function adminSaveRedirect(
  rawSlug: string,
  rawDestination: string
): Promise<void> {
  const slug = normalizeSlug(rawSlug);
  const destination = normalizeDestination(rawDestination);

  if (!slug || !destination) {
    throw new Error('Both a slug and a destination are required.');
  }

  const sql = getSql();
  await sql`
    insert into redirects (slug, destination)
    values (${slug}, ${destination})
    on conflict (slug) do update set destination = excluded.destination
  `;
}

export async function adminDeleteRedirect(id: string): Promise<void> {
  const sql = getSql();
  await sql`delete from redirects where id = ${id}`;
}
