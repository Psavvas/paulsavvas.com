import { getSql } from './db';
import { createSnapshotCache } from './cache';

type Snapshot = {
  projects: any[];
  posts: any[];
  banners: any[];
  redirects: any[];
  content: { key: string; body_md: string }[];
};

// One bounded snapshot for this small portfolio. No auth data or drafts.
const snapshot = createSnapshotCache<Snapshot>(async () => {
  const sql = getSql();
  const [row] = await sql`
    select
      coalesce((select jsonb_agg(p) from (
        select id, title, summary, slug, tags, year, featured, ai_built,
          has_page, project_info_url, featured_blog_slug, body_md
        from projects where visibility = 'published'
      ) p), '[]'::jsonb) as projects,
      coalesce((select jsonb_agg(b order by b.published_on desc, b.created_at desc) from (
        select id, title, slug, summary, tags, featured_project_slug, body_md,
          published_on, created_at, to_char(published_on, 'YYYY-MM-DD') as date_iso
        from blog_posts where visibility = 'published'
      ) b), '[]'::jsonb) as posts,
      coalesce((select jsonb_agg(b order by b.sort_order, b.created_at) from (
        select id, body_md, color, scope, paths, active, sort_order, updated_at, created_at
        from banners where active = true
      ) b), '[]'::jsonb) as banners,
      coalesce((select jsonb_agg(r) from (select slug, destination from redirects) r), '[]'::jsonb) as redirects,
      coalesce((select jsonb_agg(c) from (select key, body_md from site_content) c), '[]'::jsonb) as content
  `;
  return row as Snapshot;
});

export const getPublicContent = () => snapshot.read();
export const invalidateCache = (_collection?: string) => snapshot.invalidate();
