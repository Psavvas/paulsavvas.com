import { getSql } from './db';
import { renderMarkdown, splitProjectHtml } from './markdown';

export interface ProjectRecord {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  year?: string;
  featured: boolean;
  aiBuilt: boolean;
  projectPage: boolean;
  slug?: string;
  projectInfoUrl?: string;
  featuredBlog?: string;
  topLinksHtml?: string;
  bodyHtml?: string;
}

export interface AdminProject extends ProjectRecord {
  bodyMd: string;
  visibility: 'draft' | 'published';
  updatedAt: string;
}

export interface ProjectDestination {
  url: string;
  external: boolean;
}

export interface ProjectInput {
  title: string;
  summary: string;
  slug?: string;
  tags: string[];
  year?: string;
  featured: boolean;
  aiBuilt: boolean;
  projectPage: boolean;
  projectInfoUrl?: string;
  featuredBlog?: string;
  bodyMd: string;
  visibility: 'draft' | 'published';
}

function toProjectRecord(row: any): ProjectRecord {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? '',
    tags: row.tags ?? [],
    year: row.year ?? undefined,
    featured: Boolean(row.featured),
    aiBuilt: Boolean(row.ai_built),
    projectPage: Boolean(row.has_page),
    slug: row.slug ?? undefined,
    projectInfoUrl: row.project_info_url ?? undefined,
    featuredBlog: row.featured_blog_slug ?? undefined,
  };
}

function toAdminProject(row: any): AdminProject {
  return {
    ...toProjectRecord(row),
    bodyMd: row.body_md ?? '',
    visibility: row.visibility === 'published' ? 'published' : 'draft',
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function getProjectSortYear(year?: string): number {
  if (!year) return Number.NEGATIVE_INFINITY;

  const trimmed = year.trim();
  const yearMatch = trimmed.match(/\d{4}/);
  if (yearMatch) return Number(yearMatch[0]);

  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) return new Date(parsedDate).getUTCFullYear();

  return Number.NEGATIVE_INFINITY;
}

function sortProjects(projects: ProjectRecord[]): ProjectRecord[] {
  return projects.sort((left, right) => {
    const leftYear = getProjectSortYear(left.year);
    const rightYear = getProjectSortYear(right.year);

    if (rightYear !== leftYear) {
      return rightYear - leftYear;
    }

    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }

    return left.title.localeCompare(right.title);
  });
}

// Public getters never throw: if the database is missing or unreachable the
// site renders with empty content instead of a 500. The failure is logged
// (visible in Vercel's function logs) and surfaced in the /admin dashboard.
export async function getPublishedProjects(): Promise<ProjectRecord[]> {
  try {
    const sql = getSql();
    const rows = await sql`
      select id, title, summary, slug, tags, year, featured, ai_built, has_page,
             project_info_url, featured_blog_slug
      from projects
      where visibility = 'published'
    `;

    return sortProjects(rows.map(toProjectRecord));
  } catch (error) {
    console.error('Failed to load projects from the database.', error);
    return [];
  }
}

export async function getPublishedProjectPages(): Promise<ProjectRecord[]> {
  const projects = await getPublishedProjects();
  return projects.filter(
    (project) => project.projectPage && Boolean(project.slug)
  );
}

export async function getProjectBySlug(
  slug: string
): Promise<ProjectRecord | undefined> {
  try {
    const sql = getSql();
    const rows = await sql`
      select id, title, summary, slug, tags, year, featured, ai_built, has_page,
             project_info_url, featured_blog_slug, body_md
      from projects
      where visibility = 'published' and has_page = true and slug = ${slug}
      limit 1
    `;

    if (rows.length === 0) return undefined;

    const project = toProjectRecord(rows[0]);
    const html = renderMarkdown(rows[0].body_md ?? '');
    const { topLinksHtml, bodyHtml } = splitProjectHtml(html);
    project.topLinksHtml = topLinksHtml;
    project.bodyHtml = bodyHtml;

    return project;
  } catch (error) {
    console.error('Failed to load project from the database.', error);
    return undefined;
  }
}

export function getProjectDestination(
  project: ProjectRecord
): ProjectDestination | null {
  if (project.projectPage && project.slug) {
    return { url: `/projects/${project.slug}`, external: false };
  }

  if (!project.projectPage && project.projectInfoUrl) {
    return { url: project.projectInfoUrl, external: true };
  }

  return null;
}

export function formatProjectYear(year?: string): string | undefined {
  const value = year?.trim();
  return value ? value : undefined;
}

export function getLatestProject(
  projects: ProjectRecord[]
): ProjectRecord | undefined {
  return sortProjects(projects.slice())[0];
}

// ---------------------------------------------------------------------------
// Admin portal queries
// ---------------------------------------------------------------------------

export async function adminListProjects(): Promise<AdminProject[]> {
  const sql = getSql();
  const rows = await sql`
    select * from projects
    order by updated_at desc
  `;
  return rows.map(toAdminProject);
}

export async function adminGetProject(
  id: string
): Promise<AdminProject | undefined> {
  const sql = getSql();
  const rows = await sql`select * from projects where id = ${id} limit 1`;
  return rows.length > 0 ? toAdminProject(rows[0]) : undefined;
}

export async function adminCreateProject(input: ProjectInput): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    insert into projects
      (title, summary, slug, tags, year, featured, ai_built, has_page,
       project_info_url, featured_blog_slug, body_md, visibility)
    values
      (${input.title}, ${input.summary}, ${input.slug ?? null}, ${input.tags},
       ${input.year ?? null}, ${input.featured}, ${input.aiBuilt}, ${input.projectPage},
       ${input.projectInfoUrl ?? null}, ${input.featuredBlog ?? null},
       ${input.bodyMd}, ${input.visibility})
    returning id
  `;
  return rows[0].id as string;
}

export async function adminUpdateProject(
  id: string,
  input: ProjectInput
): Promise<void> {
  const sql = getSql();
  await sql`
    update projects set
      title = ${input.title},
      summary = ${input.summary},
      slug = ${input.slug ?? null},
      tags = ${input.tags},
      year = ${input.year ?? null},
      featured = ${input.featured},
      ai_built = ${input.aiBuilt},
      has_page = ${input.projectPage},
      project_info_url = ${input.projectInfoUrl ?? null},
      featured_blog_slug = ${input.featuredBlog ?? null},
      body_md = ${input.bodyMd},
      visibility = ${input.visibility}
    where id = ${id}
  `;
}

export async function adminDeleteProject(id: string): Promise<void> {
  const sql = getSql();
  await sql`delete from projects where id = ${id}`;
}
