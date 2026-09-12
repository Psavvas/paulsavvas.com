import { getSql } from './db';

/**
 * Key/value store behind the editable parts of the site that aren't projects,
 * posts, banners, or redirects. One row per field: `key` names the field (for
 * example `about.heading`) and `body_md` holds its value — Markdown for prose
 * fields, plain text for short ones like headings.
 */

/** Every stored field, keyed by `key`. Unset fields are simply absent. */
export async function getSiteContent(): Promise<Record<string, string>> {
  const sql = getSql();
  // The whole table is a handful of rows, so it is cheaper to read it in one
  // round trip than to bind a key list per caller.
  const rows = await sql`select key, body_md from site_content`;

  const values: Record<string, string> = {};
  for (const row of rows) {
    values[String(row.key)] = row.body_md ?? '';
  }
  return values;
}

/** Upserts the given fields. Keys that aren't passed are left untouched. */
export async function saveSiteContent(
  values: Record<string, string>
): Promise<void> {
  const sql = getSql();

  // One statement per field: the tagged-template client has no transaction of
  // its own, and a partial save on a dropped connection is recoverable — the
  // editor is one form the owner can simply submit again.
  for (const [key, value] of Object.entries(values)) {
    await sql`
      insert into site_content (key, body_md)
      values (${key}, ${value})
      on conflict (key) do update set body_md = excluded.body_md
    `;
  }
}
