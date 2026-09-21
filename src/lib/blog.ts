import { getSql } from './db';
import { renderMarkdown } from './markdown';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  summary: string;
  /** Human-readable publish date, e.g. "July 15, 2026". */
  date: string;
  /** ISO publish date (yyyy-mm-dd), used by admin forms and sorting. */
  dateIso: string;
  tags: string[];
  featuredProjectSlug?: string;
  bodyHtml?: string;
}

export interface AdminBlogPost extends BlogPost {
  bodyMd: string;
  visibility: 'draft' | 'published';
  updatedAt: string;
}

export interface BlogPostInput {
  title: string;
  slug: string;
  summary: string;
  dateIso: string;
  tags: string[];
  featuredProjectSlug?: string;
  bodyMd: string;
  visibility: 'draft' | 'published';
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function toBlogPost(row: any): BlogPost {
  const dateIso = row.date_iso ?? '';
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? '',
    date: formatDate(dateIso),
    dateIso,
    tags: row.tags ?? [],
    featuredProjectSlug: row.featured_project_slug ?? undefined,
  };
}

function toAdminBlogPost(row: any): AdminBlogPost {
  return {
    ...toBlogPost(row),
    bodyMd: row.body_md ?? '',
    visibility: row.visibility === 'published' ? 'published' : 'draft',
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export async function getPublishedBlogPosts(): Promise<BlogPost[]> {
  // Public getters never throw: if the database is missing or unreachable
  // the site renders with empty content instead of a 500.
  try {
    const sql = getSql();
    const rows = await sql`
      select id, title, slug, summary, tags, featured_project_slug,
             to_char(published_on, 'YYYY-MM-DD') as date_iso
      from blog_posts
      where visibility = 'published'
      order by published_on desc, created_at desc
    `;
    return rows.map(toBlogPost);
  } catch (error) {
    console.error('Failed to load blog posts from the database.', error);
    return [];
  }
}

export async function getBlogPostBySlug(
  slug: string
): Promise<BlogPost | undefined> {
  try {
    const sql = getSql();
    const rows = await sql`
      select id, title, slug, summary, tags, featured_project_slug, body_md,
             to_char(published_on, 'YYYY-MM-DD') as date_iso
      from blog_posts
      where visibility = 'published' and slug = ${slug}
      limit 1
    `;

    if (rows.length === 0) return undefined;

    const post = toBlogPost(rows[0]);
    post.bodyHtml = renderMarkdown(rows[0].body_md ?? '');
    return post;
  } catch (error) {
    console.error('Failed to load blog post from the database.', error);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Admin portal queries
// ---------------------------------------------------------------------------

export async function adminListBlogPosts(): Promise<AdminBlogPost[]> {
  const sql = getSql();
  const rows = await sql`
    select *, to_char(published_on, 'YYYY-MM-DD') as date_iso
    from blog_posts
    order by published_on desc, created_at desc
  `;
  return rows.map(toAdminBlogPost);
}

export async function adminGetBlogPost(
  id: string
): Promise<AdminBlogPost | undefined> {
  const sql = getSql();
  const rows = await sql`
    select *, to_char(published_on, 'YYYY-MM-DD') as date_iso
    from blog_posts where id = ${id} limit 1
  `;
  return rows.length > 0 ? toAdminBlogPost(rows[0]) : undefined;
}

export async function adminCreateBlogPost(
  input: BlogPostInput
): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    insert into blog_posts
      (title, slug, summary, published_on, tags, featured_project_slug, body_md, visibility)
    values
      (${input.title}, ${input.slug}, ${input.summary}, ${input.dateIso},
       ${input.tags}, ${input.featuredProjectSlug ?? null}, ${input.bodyMd}, ${input.visibility})
    returning id
  `;
  return rows[0].id as string;
}

export async function adminUpdateBlogPost(
  id: string,
  input: BlogPostInput
): Promise<void> {
  const sql = getSql();
  await sql`
    update blog_posts set
      title = ${input.title},
      slug = ${input.slug},
      summary = ${input.summary},
      published_on = ${input.dateIso},
      tags = ${input.tags},
      featured_project_slug = ${input.featuredProjectSlug ?? null},
      body_md = ${input.bodyMd},
      visibility = ${input.visibility}
    where id = ${id}
  `;
}

export async function adminDeleteBlogPost(id: string): Promise<void> {
  const sql = getSql();
  await sql`delete from blog_posts where id = ${id}`;
}
