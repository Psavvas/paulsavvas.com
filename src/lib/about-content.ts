import { renderButtonLinks, renderMarkdown } from './markdown';
import { getSiteContent, saveSiteContent } from './site-content';

/**
 * Every editable field on the About page. Prose fields are Markdown; headings
 * are plain text.
 */
export interface AboutContent {
  eyebrow: string;
  heading: string;
  introMd: string;
  valuesHeading: string;
  valuesMd: string;
  workHeading: string;
  workMd: string;
  nowHeading: string;
  nowMd: string;
  linksMd: string;
}

/**
 * The `site_content` key each field is stored under. `now` has no `about.`
 * prefix on purpose: it predates this editor, so keeping the key means the
 * blurb written in the old "Now section" screen still shows.
 */
const KEYS: Record<keyof AboutContent, string> = {
  eyebrow: 'about.eyebrow',
  heading: 'about.heading',
  introMd: 'about.intro',
  valuesHeading: 'about.values_heading',
  valuesMd: 'about.values',
  workHeading: 'about.work_heading',
  workMd: 'about.work',
  nowHeading: 'about.now_heading',
  nowMd: 'now',
  linksMd: 'about.links',
};

/**
 * Built-in copy. A field left empty in the admin portal — or a database that
 * can't be reached — falls back to this, so /about is never blank.
 */
export const ABOUT_DEFAULTS: AboutContent = {
  eyebrow: 'About',
  heading: 'Building practical tools, thoughtfully.',
  introMd: `I'm Paul Savvas, a student at the SMCPS STEM Academy (Grade 10) who enjoys turning ideas into real, working things. I like projects where engineering and design meet: clear constraints, measurable results, and details that hold up outside a demo.

Most of my projects start with failure: circuits that don't work, code that breaks, prints that warp. I treat those setbacks as data: they show what needs fixing. Through CAD design, programming, and hardware builds, I've learned that progress comes from testing assumptions early and iterating until the solution works reliably.

Alongside my projects, I maintain straight A's at the STEM Academy and look for opportunities to help classmates work through technical problems. Leadership, for me, means making sure the people around you have what they need to improve, whether that's clearer documentation, a second perspective, or just accountability to keep moving forward.`,
  valuesHeading: 'What I care about',
  valuesMd: `- **Simplicity:** reduce complexity until the system is easy to understand.
- **Durability:** build things that keep working when conditions change.
- **Useful output:** ship tools that solve real problems and improve over time.
- **Good communication:** document decisions and make the work easy to collaborate on.
- **Learning from failure:** treat setbacks as feedback and use them to refine the approach.`,
  workHeading: 'What I work on',
  workMd: `- Software: small products, utilities, and experiments that are fast to iterate and easy to maintain.
- Hardware: practical builds where constraints (power, sensors, materials) shape the solution.
- 3D design: parts and prototypes that are tested, adjusted, and refined in real conditions.`,
  nowHeading: 'Now',
  nowMd: `Right now, I'm focused on building a platform that redefines how independent learners connect, collaborate, and teach one another. I can't share too many details yet, but the goal is to make peer learning more accessible and effective. I'll share more as the project is finalized, and I hope to announce it publicly by August 2026.

If you want to see what I'm working on, the best place to start is my GitHub or Thingiverse.`,
  linksMd: `[Visit GitHub](https://github.com/psavvas)
[Visit Thingiverse](https://www.thingiverse.com/psavvas/)`,
};

const FIELDS = Object.keys(KEYS) as Array<keyof AboutContent>;

function fromStore(values: Record<string, string>): AboutContent {
  const content = {} as AboutContent;

  for (const field of FIELDS) {
    const stored = values[KEYS[field]]?.trim();
    content[field] = stored || ABOUT_DEFAULTS[field];
  }

  return content;
}

/** The About page as stored, with built-in copy filling any gap. */
export async function getAboutContent(): Promise<AboutContent> {
  try {
    return fromStore(await getSiteContent());
  } catch (error) {
    console.warn(
      'Failed to load the About page content from the database; using fallback copy.',
      error
    );
    return { ...ABOUT_DEFAULTS };
  }
}

/** Render-ready counterpart to {@link AboutContent}. */
export interface AboutContentHtml {
  eyebrow: string;
  heading: string;
  introHtml: string;
  valuesHeading: string;
  valuesHtml: string;
  workHeading: string;
  workHtml: string;
  nowHeading: string;
  nowHtml: string;
  linksHtml: string;
}

/** The About page with its Markdown fields rendered to HTML. */
export async function getAboutContentHtml(): Promise<AboutContentHtml> {
  const content = await getAboutContent();

  return {
    eyebrow: content.eyebrow,
    heading: content.heading,
    introHtml: renderMarkdown(content.introMd),
    valuesHeading: content.valuesHeading,
    valuesHtml: renderMarkdown(content.valuesMd),
    workHeading: content.workHeading,
    workHtml: renderMarkdown(content.workMd),
    nowHeading: content.nowHeading,
    nowHtml: renderMarkdown(content.nowMd),
    linksHtml: renderButtonLinks(content.linksMd),
  };
}

// ---------------------------------------------------------------------------
// Admin portal
// ---------------------------------------------------------------------------

/**
 * Same as {@link getAboutContent} but lets database errors through, so the
 * editor can show them instead of silently editing fallback copy.
 */
export async function adminGetAboutContent(): Promise<AboutContent> {
  return fromStore(await getSiteContent());
}

export async function adminSaveAboutContent(
  content: AboutContent
): Promise<void> {
  const values: Record<string, string> = {};

  for (const field of FIELDS) {
    // Store the default as an empty value: the page falls back to it anyway,
    // and unedited fields then keep tracking the built-in copy.
    const value = content[field].trim();
    values[KEYS[field]] = value === ABOUT_DEFAULTS[field].trim() ? '' : value;
  }

  await saveSiteContent(values);
}

/** Reads the editor form. Blank fields come back as the built-in copy. */
export function readAboutForm(form: FormData): AboutContent {
  const content = {} as AboutContent;

  for (const field of FIELDS) {
    const value = String(form.get(field) ?? '').trim();
    content[field] = value || ABOUT_DEFAULTS[field];
  }

  return content;
}
