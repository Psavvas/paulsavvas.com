import { Marked } from 'marked';

// Markdown → HTML pipeline shared by projects, blog posts, and the About
// page. Ported from the previous Notion integration so rendered output
// (image figures, video embeds, top-link buttons) is unchanged.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLinkText(text: string): string {
  const trimmed = text.trim();

  const boldMatch = trimmed.match(/^(\*\*|__)(.+)\1$/);
  if (boldMatch) {
    return `<strong>${escapeHtml(boldMatch[2])}</strong>`;
  }

  const italicMatch = trimmed.match(/^(\*|_)(.+)\1$/);
  if (italicMatch) {
    return `<em>${escapeHtml(italicMatch[2])}</em>`;
  }

  return escapeHtml(trimmed)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

function renderMediaEmbed(url: string, alt: string): string {
  if (!url) return '';

  const safeAlt = alt.replace(/"/g, '&quot;');

  return `<figure data-project-media="image"><img src="${url}" alt="${safeAlt}" loading="lazy" style="display:block;margin:0 auto;width:auto;max-width:min(100%,540px);height:auto;max-height:70vh;object-fit:contain;border-radius:0.75rem;border:1px solid rgb(229 231 235);" /></figure>`;
}

function renderVideoEmbed(url: string): string {
  return `<div class="my-8 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-950 dark:border-neutral-800"><iframe src="${url}" class="aspect-video w-full" loading="lazy" style="display:block;border:0;width:100%;height:100%;" allowfullscreen></iframe></div>`;
}

/**
 * Lays out consecutive image figures: pairs become a two-column grid, a
 * remaining single image is centred.
 */
function arrangeProjectMedia(html: string): string {
  const imageFigurePattern =
    /<figure data-project-media="image">[\s\S]*?<\/figure>/g;
  const figures = html.match(imageFigurePattern);

  if (!figures || figures.length === 0) return html;

  let result = '';
  let lastIndex = 0;
  let pendingFigures: string[] = [];

  const flushPendingFigures = () => {
    if (pendingFigures.length === 0) return;

    for (let index = 0; index < pendingFigures.length; index += 2) {
      const pair = pendingFigures.slice(index, index + 2);

      if (pair.length === 2) {
        result += `<div class="my-8 grid gap-4 md:grid-cols-2 items-start">${pair
          .map((figure) =>
            figure.replace(
              '<figure data-project-media="image">',
              '<figure class="m-0">'
            )
          )
          .join('')}</div>`;
      } else {
        result += `<div class="my-8 flex justify-center">${pair[0].replace(
          '<figure data-project-media="image">',
          '<figure class="m-0">'
        )}</div>`;
      }
    }

    pendingFigures = [];
  };

  for (const match of html.matchAll(imageFigurePattern)) {
    const figure = match[0];
    const index = match.index ?? 0;
    const between = html.slice(lastIndex, index);

    if (between.trim()) {
      flushPendingFigures();
      result += between;
    } else if (pendingFigures.length === 0 && between) {
      result += between;
    }

    pendingFigures.push(figure);
    lastIndex = index + figure.length;
  }

  const tail = html.slice(lastIndex);
  if (tail.trim()) {
    flushPendingFigures();
    result += tail;
  } else {
    flushPendingFigures();
    result += tail;
  }

  return result;
}

function extractYouTubeId(url: string): string {
  if (url.includes('youtu.be/')) {
    return url.split('youtu.be/')[1]?.split('?')[0] || '';
  }
  if (url.includes('v=')) {
    return url.split('v=')[1]?.split('&')[0] || '';
  }
  return '';
}

function createMarkdownRenderer(): Marked {
  const instance = new Marked();

  instance.use({
    renderer: {
      link(token: any) {
        const url: string = token.href ?? '';
        const text = formatLinkText(token.text ?? '');

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          const videoId = extractYouTubeId(url);
          if (videoId) {
            return renderVideoEmbed(`https://www.youtube.com/embed/${videoId}`);
          }
        }

        if (url.includes('vimeo.com')) {
          const videoId = url.split('vimeo.com/')[1]?.split('?')[0] || '';
          if (videoId) {
            return renderVideoEmbed(
              `https://player.vimeo.com/video/${videoId}`
            );
          }
        }

        return `<a href="${url}">${text}</a>`;
      },
      image(token: any) {
        return renderMediaEmbed(token.href ?? '', token.text || 'Image');
      },
    },
  });

  return instance;
}

const markdownRenderer = createMarkdownRenderer();

/** Render trusted Markdown (admin-authored content) to site HTML. */
export function renderMarkdown(markdown: string): string {
  const source = markdown?.trim();
  if (!source) return '';

  const html = markdownRenderer.parse(source, { async: false }) as string;
  return arrangeProjectMedia(html).trim();
}

// Banners are a thin strip of text above the nav, so they deliberately skip
// the project/blog pipeline: a pasted YouTube link should stay a link rather
// than expanding into an embedded player, and images stay plain <img> tags.
const bannerRenderer = new Marked();

/** Render Markdown for a site banner. Links stay links; no media embeds. */
export function renderBannerMarkdown(markdown: string): string {
  const source = markdown?.trim();
  if (!source) return '';

  return (bannerRenderer.parse(source, { async: false }) as string).trim();
}

interface ButtonLink {
  href: string;
  label: string;
  external: boolean;
}

/** Every distinct link in rendered HTML, in document order. */
function extractLinks(html: string): ButtonLink[] {
  const linkPattern = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const links: ButtonLink[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(linkPattern)) {
    const href = match[1];
    const label = match[2].trim();
    const key = `${href}|${label}`;

    if (seen.has(key)) continue;
    seen.add(key);

    let external = false;
    try {
      external = new URL(href).protocol.startsWith('http');
    } catch {
      external = false;
    }

    links.push({ href, label, external });
  }

  return links;
}

function externalAttrs(external: boolean): string {
  return external ? ' target="_blank" rel="noopener noreferrer"' : '';
}

function buildTopLinksHtml(html: string): string {
  const links = extractLinks(html);

  if (links.length === 0) return '';

  const hasMultipleLinks = links.length > 1;

  return `<div class="mt-10 flex flex-wrap gap-3">${links
    .map(
      ({ href, label, external }, index) =>
        `<a href="${href}"${externalAttrs(external)} class="site-btn hover-lift ${
          hasMultipleLinks && index === 0 ? 'site-btn--project-primary' : ''
        }">${label}</a>`
    )
    .join('')}</div>`;
}

/**
 * Renders a Markdown list of links as bare site buttons — used by the About
 * page, whose link row is editable from the admin portal. The caller supplies
 * the wrapping layout, and no link is promoted to a primary button.
 */
export function renderButtonLinks(markdown: string): string {
  const source = markdown?.trim();
  if (!source) return '';

  const html = bannerRenderer.parse(source, { async: false }) as string;

  return extractLinks(html)
    .map(
      ({ href, label, external }) =>
        `<a class="site-btn hover-lift" href="${href}"${externalAttrs(external)}>${label}</a>`
    )
    .join('');
}

/**
 * Splits rendered project HTML on the first <hr>: links above the divider
 * become the button row at the top of the project page, the rest is the body.
 */
export function splitProjectHtml(html: string): {
  topLinksHtml: string;
  bodyHtml: string;
} {
  const dividerIndex = html.search(/<hr\b[^>]*>/i);
  if (dividerIndex >= 0) {
    const topSection = html.slice(0, dividerIndex);
    const dividerEnd =
      html.slice(dividerIndex).match(/^<hr\b[^>]*>\s*/i)?.[0].length ?? 0;
    const bodyHtml = html.slice(dividerIndex + dividerEnd);

    return {
      topLinksHtml: buildTopLinksHtml(topSection),
      bodyHtml,
    };
  }

  return {
    topLinksHtml: '',
    bodyHtml: html,
  };
}
