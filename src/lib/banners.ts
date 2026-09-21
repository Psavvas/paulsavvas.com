import {
  BANNER_COLORS,
  BANNER_SCOPES,
  normalizePath,
  type BannerColor,
  type BannerScope,
} from './banner-colors';
import { getSql } from './db';
import { renderBannerMarkdown } from './markdown';

// Presentation constants live in ./banner-colors so browser scripts can use
// them without importing the database layer.
export {
  BANNER_COLORS,
  BANNER_COLOR_CLASSES,
  BANNER_SCOPES,
  normalizePath,
} from './banner-colors';
export type { BannerColor, BannerScope } from './banner-colors';

export interface Banner {
  id: string;
  bodyMd: string;
  bodyHtml: string;
  color: BannerColor;
  scope: BannerScope;
  paths: string[];
  active: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface BannerInput {
  bodyMd: string;
  color: BannerColor;
  scope: BannerScope;
  paths: string[];
  active: boolean;
  sortOrder: number;
}

function toColor(value: unknown): BannerColor {
  return BANNER_COLORS.some((color) => color.value === value)
    ? (value as BannerColor)
    : 'neutral';
}

function toScope(value: unknown): BannerScope {
  return BANNER_SCOPES.some((scope) => scope.value === value)
    ? (value as BannerScope)
    : 'all';
}

function toBanner(row: any): Banner {
  const bodyMd = row.body_md ?? '';
  return {
    id: row.id,
    bodyMd,
    bodyHtml: renderBannerMarkdown(bodyMd),
    color: toColor(row.color),
    scope: toScope(row.scope),
    paths: row.paths ?? [],
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order ?? 0),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function matchesPath(banner: Banner, pathname: string): boolean {
  switch (banner.scope) {
    case 'all':
      return true;
    case 'home':
      return pathname === '/';
    case 'paths':
      return banner.paths.map(normalizePath).includes(pathname);
    default:
      return false;
  }
}

/**
 * Active banners for a page, in display order. Never throws — a missing or
 * unreachable database simply means no banners.
 */
export async function getBannersForPath(pathname: string): Promise<Banner[]> {
  try {
    const sql = getSql();
    const rows = await sql`
      select id, body_md, color, scope, paths, active, sort_order, updated_at
      from banners
      where active = true
      order by sort_order asc, created_at asc
    `;

    const target = normalizePath(pathname);
    return rows
      .map(toBanner)
      .filter((banner) => banner.bodyMd.trim() && matchesPath(banner, target));
  } catch (error) {
    console.error('Failed to load banners from the database.', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Admin portal queries
// ---------------------------------------------------------------------------

export async function adminListBanners(): Promise<Banner[]> {
  const sql = getSql();
  const rows = await sql`
    select id, body_md, color, scope, paths, active, sort_order, updated_at
    from banners
    order by sort_order asc, created_at asc
  `;
  return rows.map(toBanner);
}

export async function adminGetBanner(id: string): Promise<Banner | undefined> {
  const sql = getSql();
  const rows = await sql`
    select id, body_md, color, scope, paths, active, sort_order, updated_at
    from banners where id = ${id} limit 1
  `;
  return rows.length > 0 ? toBanner(rows[0]) : undefined;
}

export async function adminCreateBanner(input: BannerInput): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    insert into banners (body_md, color, scope, paths, active, sort_order)
    values (${input.bodyMd}, ${input.color}, ${input.scope}, ${input.paths},
            ${input.active}, ${input.sortOrder})
    returning id
  `;
  return rows[0].id as string;
}

export async function adminUpdateBanner(
  id: string,
  input: BannerInput
): Promise<void> {
  const sql = getSql();
  await sql`
    update banners set
      body_md = ${input.bodyMd},
      color = ${input.color},
      scope = ${input.scope},
      paths = ${input.paths},
      active = ${input.active},
      sort_order = ${input.sortOrder}
    where id = ${id}
  `;
}

export async function adminDeleteBanner(id: string): Promise<void> {
  const sql = getSql();
  await sql`delete from banners where id = ${id}`;
}
