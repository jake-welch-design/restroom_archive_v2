import { escapeHtml } from "./html";
import { formatDayMonthYear } from "./formatDate";
import { US_STATES, countryName, subdivisionFromLocation } from "./regions";

/**
 * The Weekly Report: the archive's email newsletter.
 *
 * One renderer for both sides. The admin composer (pages/newsletter.vue) calls
 * it in the browser for the live preview, and the send endpoints call it on the
 * server for the HTML that goes to Plunk, so what the admin approves is exactly
 * what is sent.
 *
 * The design is the "Weekly Report" Figma file: the site's monochrome language
 * (Arial, 14px, black ink, #666 muted, 1px black rules, black buttons), a 600px
 * column with 32px gutters, and submissions two to a row at every width. Email
 * clients need table layout and inline styles, so it is written that way rather
 * than with the site's CSS.
 */

/** One restroom as the email shows it: the site's three-line stack. */
export interface ReportEntry {
  slug: string;
  name: string;
  /** ISO date the scan was taken. */
  isoDate: string;
  location: string;
  /**
   * Site-relative (`/api/r2/thumbs/...`) or absolute. Resolved against the
   * site's URL when rendered, since an email has no page to be relative to.
   */
  imageUrl: string | null;
}

export interface ReportFeatured extends ReportEntry {
  note: string;
}

export interface ReportNotes {
  headline: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
}

/**
 * The Stats section: running totals as of the issue's last day, and what that
 * week added. Worked out once in the composer (computeReportStats) and kept on
 * the issue, so the email shows what the admin saw when they sent it.
 */
export interface ReportTotals {
  restrooms: number;
  archivists: number;
  /** Null while any entry has no country, as on the About page. */
  countries: number | null;
  cities: number;
}

export interface ReportWeekStats {
  /** The week's most prolific submitters: more than one on a tie. */
  topArchivists: { name: string; count: number }[];
  newCountries: string[];
  newStates: string[];
  newCities: string[];
}

/** Either half can be left out of an issue on its own; null is left out. */
export interface ReportStats {
  totals: ReportTotals | null;
  week: ReportWeekStats | null;
}

export interface WeeklyReportIssue {
  /** ISO dates, inclusive. A week runs Sunday to Saturday. */
  weekStart: string;
  weekEnd: string;
  subject: string;
  /** The inbox preview line. */
  preheader: string;
  featured: ReportFeatured | null;
  submissions: ReportEntry[];
  notes: ReportNotes | null;
  stats: ReportStats | null;
}

/**
 * A postal address for the footer, after the archive's name. Empty by choice:
 * the Weekly Report sells and promotes nothing, so it isn't commercial email
 * under CAN-SPAM, and the address it would need is a home address. If the
 * newsletter ever carries sponsors, merch or anything for sale, put a PO box
 * here.
 */
export const WEEKLY_REPORT_MAILING_ADDRESS = "";

/** Plunk replaces this with each recipient's own unsubscribe link. */
export const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribeUrl}}";

const SITE_NAME = "The Restroom Archive";
/** Printed in the footer; it's also every issue's reply-to. */
const CONTACT_EMAIL = "hello@restroomarchive.com";

/* --- Dates ----------------------------------------------------------------- */

function utcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The Archive's clock for the Weekly Report: a week runs from 12:00 AM Sunday
 * to 11:59 PM Saturday here. Submission times are stored in UTC, so without
 * this a scan sent in on a Saturday evening would land on Sunday. A fixed zone
 * rather than the browser's, because the composer is first rendered on the
 * server, which runs in UTC, and both must agree on the list.
 */
export const REPORT_TIME_ZONE = "America/New_York";

const reportDayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: REPORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A moment's calendar day in the Archive's time zone, as `YYYY-MM-DD`. */
function dayInReportZone(d: Date): string {
  const part = (type: string) =>
    reportDayParts.formatToParts(d).find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The day a submission belongs to: its `createdAt` (SQLite's UTC
 * `YYYY-MM-DD HH:MM:SS`) read in the Archive's time zone.
 */
export function submittedDay(createdAt: string): string {
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/i.test(createdAt);
  const d = new Date(createdAt.replace(" ", "T") + (hasZone ? "" : "Z"));
  return Number.isNaN(d.getTime())
    ? createdAt.slice(0, 10)
    : dayInReportZone(d);
}

/**
 * The last full week before `today`, Sunday to Saturday, in the Archive's time
 * zone: on Tuesday 17 November 2026 that is 8–14 November.
 */
export function previousWeek(today = new Date()): {
  start: string;
  end: string;
} {
  const d = utcDate(dayInReportZone(today));
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() - d.getUTCDay() - 1);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  return { start: isoDay(start), end: isoDay(end) };
}

/** `8 Nov 2026`: the masthead's form, without the list's leading zero. */
function shortDate(iso: string): string {
  const d = utcDate(iso);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

/** `8 Nov 2026 – 14 Nov 2026` */
export function weekRangeLabel(start: string, end: string): string {
  return `${shortDate(start)} – ${shortDate(end)}`;
}

export function defaultSubject(start: string, end: string): string {
  return `Weekly Report · ${weekRangeLabel(start, end)}`;
}

/**
 * The Updates link's wording when none is typed: a page on the site says so,
 * anywhere else doesn't. Exported for the composer's placeholder.
 */
export function updateLinkFallback(url: string): string {
  return /^https?:\/\//.test(url.trim()) &&
    !/^https:\/\/(www\.)?restroomarchive\.com(\/|$)/.test(url.trim())
    ? "Read more →"
    : "Read more on the site →";
}

/* --- Stats ----------------------------------------------------------------- */

/** What computeReportStats needs of an entry: a subset of RestroomSummary. */
export interface StatsEntry {
  slug: string;
  establishment: string | null;
  location: string;
  country: string | null;
  submitter: { username: string; displayName: string | null } | null;
  status: string;
  /** When it was submitted: SQLite `datetime('now')`, UTC. */
  createdAt: string;
}

/**
 * Totals as of `weekEnd`, counted the way server/api/stats.get.ts counts them
 * for the About page (restrooms by establishment, cities by location,
 * archivists by submitter), and the week's firsts: a country, state or city is
 * new if its earliest published entry was submitted that week.
 */
export function computeReportStats(
  all: StatsEntry[],
  weekStart: string,
  weekEnd: string,
): { totals: ReportTotals; week: ReportWeekStats } {
  const day = (e: StatsEntry) => submittedDay(e.createdAt);
  const published = all
    .filter((e) => e.status === "published" && day(e) <= weekEnd)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const inWeek = (e: StatsEntry) => day(e) >= weekStart;

  const distinct = (key: (e: StatsEntry) => string | null | undefined) =>
    new Set(published.map(key).filter(Boolean)).size;

  /** Each key's first entry, in order of first appearance. */
  const firsts = (key: (e: StatsEntry) => string | null) => {
    const seen = new Map<string, StatsEntry>();
    for (const e of published) {
      const k = key(e);
      if (k && !seen.has(k)) seen.set(k, e);
    }
    return [...seen].filter(([, e]) => inWeek(e)).map(([k]) => k);
  };

  const stateName = (e: StatsEntry) => {
    if (e.country !== "US") return null;
    const code = subdivisionFromLocation(e.location);
    return US_STATES.find((r) => r.code === code)?.name ?? null;
  };
  // "Brooklyn, NY" reads as it is; "Lisbon, PT" gets its country spelt out.
  const cityLabel = (location: string) => {
    const cut = location.lastIndexOf(",");
    const code = location.slice(cut + 1).trim();
    const entry = published.find((e) => e.location === location);
    if (cut === -1 || !entry?.country || ["US", "CA"].includes(entry.country))
      return location;
    return `${location.slice(0, cut).trim()}, ${countryName(entry.country) ?? code}`;
  };

  const counts = new Map<string, { name: string; count: number }>();
  for (const e of published) {
    if (!inWeek(e) || !e.submitter) continue;
    const c = counts.get(e.submitter.username) ?? {
      name: e.submitter.displayName || `@${e.submitter.username}`,
      count: 0,
    };
    c.count++;
    counts.set(e.submitter.username, c);
  }
  const best = Math.max(0, ...[...counts.values()].map((c) => c.count));

  return {
    totals: {
      restrooms: distinct((e) => e.establishment ?? e.slug),
      archivists: distinct((e) => e.submitter?.username),
      countries: published.some((e) => !e.country)
        ? null
        : distinct((e) => e.country),
      cities: distinct((e) => e.location),
    },
    week: {
      topArchivists: best
        ? [...counts.values()].filter((c) => c.count === best)
        : [],
      newCountries: firsts((e) => e.country).map((c) => countryName(c) ?? c),
      newStates: firsts(stateName),
      newCities: firsts((e) => e.location).map(cityLabel),
    },
  };
}

/* --- Rendering ------------------------------------------------------------- */

const INK = "#000000";
const MUTED = "#666666";
const CANVAS = "#f4f4f4";
const BODY = "#ffffff";
const SURFACE = "#f0f0f0";
const FONT = "Arial, Helvetica, sans-serif";

// The Figma text styles, all 14px: body copy at 150%, the three-line stacks
// and kickers at 130%, titles at 140%.
const TEXT = `font-family:${FONT};font-size:14px;line-height:21px;color:${INK};`;
const LINE = `font-family:${FONT};font-size:14px;line-height:18px;color:${INK};`;
const TITLE = `font-family:${FONT};font-size:14px;line-height:20px;color:${INK};`;
const LABEL = `font-family:${FONT};font-size:14px;line-height:18px;color:${MUTED};`;

/**
 * Added to every link back to the site. Whoever follows one is reading the
 * Weekly Report, so the subscribe pop-up stays shut for them even in a
 * browser that has never seen it (components/WeeklyReportDialog.vue).
 */
export const WEEKLY_REPORT_LINK_PARAM = {
  name: "from",
  value: "weekly-report",
};

/**
 * Tags each `href` pointing at the site with WEEKLY_REPORT_LINK_PARAM, before
 * any `#fragment` and after any query it already has. Only exact-origin links
 * match: the origin must be followed by `/`, `?`, `#` or the closing quote.
 */
function markSiteLinks(html: string, siteUrl: string): string {
  const origin = siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = `${WEEKLY_REPORT_LINK_PARAM.name}=${WEEKLY_REPORT_LINK_PARAM.value}`;
  return html.replace(
    new RegExp(`href="(${origin}(?:/[^"?#]*)?)(\\?[^"#]*)?(#[^"]*)?"`, "g"),
    (_m, path: string, query: string | undefined, hash: string | undefined) =>
      `href="${path}${query ? `${query}&amp;` : "?"}${tag}${hash ?? ""}"`,
  );
}

export interface RenderOptions {
  /** Absolute origin images and links resolve against. No trailing slash. */
  siteUrl: string;
  /** The unsubscribe href; Plunk's placeholder unless previewing. */
  unsubscribeUrl?: string;
}

function abs(url: string, siteUrl: string): string {
  return /^https?:\/\//.test(url)
    ? url
    : `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Text with its line breaks kept, as paragraphs and `<br>`s. The last
 * paragraph has no bottom margin, so the caller sets the gap after it.
 */
function prose(text: string): string {
  const paras = text.trim().split(/\n{2,}/);
  return paras
    .map(
      (p, i) =>
        `<p style="margin:0 0 ${i < paras.length - 1 ? 12 : 0}px;${TEXT}">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/**
 * A linked image. With images off (Outlook's default) the alt text stands in,
 * so it is set in the email's own type rather than the client's underlined
 * serif, and the link carries no underline of its own.
 */
function image(
  url: string | null,
  alt: string,
  width: number,
  height: number,
  siteUrl: string,
  href: string,
): string {
  if (!url)
    // Proportional padding keeps the shape when a phone narrows the column.
    return `<div style="width:100%;height:0;padding-bottom:${((height / width) * 100).toFixed(2)}%;background:${SURFACE};" class="surface"></div>`;
  return `<a href="${escapeHtml(href)}" style="text-decoration:none;"><img src="${escapeHtml(abs(url, siteUrl))}" width="${width}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;background:${SURFACE};font-family:${FONT};font-size:14px;line-height:18px;color:${MUTED};"></a>`;
}

/** Name, date, location: one per line, as under the site's grid tiles. */
function stack(lines: string[]): string {
  return lines
    .filter(Boolean)
    .map(
      (l, i) =>
        `<div style="${LINE}${i ? "padding-top:2px;" : ""}">${escapeHtml(l)}</div>`,
    )
    .join("");
}

function kicker(text: string): string {
  return `<div style="${LABEL}padding-bottom:16px;" class="muted">${escapeHtml(text)}</div>`;
}

/**
 * A live-text button: a filled table cell rather than an image or a styled
 * link alone, so it keeps its shape in Outlook and with images off.
 */
function button(label: string, href: string, full = false): string {
  // Full width: the cell and its link both stretch to the container, with the
  // label centred, and the sides drop to 12px so the label decides nothing.
  const table = full ? ' width="100%"' : "";
  const cell = full ? ' align="center"' : "";
  const link = full
    ? "display:block;padding:16px 12px;text-align:center;"
    : "display:inline-block;padding:16px 20px;";
  return `<table role="presentation"${table} cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${INK}"${cell} class="btn" style="background:${INK};border-radius:3px;"><a href="${escapeHtml(href)}" class="btn-text" style="${link}font-family:${FONT};font-size:14px;line-height:14px;color:#ffffff;text-decoration:none;white-space:nowrap;">${escapeHtml(label)}</a></td></tr></table>`;
}

/**
 * Buttons sharing the full width equally, 8px apart. The gaps are their own
 * fixed 8px columns; with `table-layout:fixed` the button columns then split
 * what's left evenly, whatever their labels. The `width` attributes are the
 * same split at 600px for Outlook, which sizes by those. Below 620px they
 * stack, each still full width.
 */
function buttonRow(labelsAndHrefs: [string, string][]): string {
  const inner = 600 - 2 * 32 - 2 * 1 - 2 * 24; // column, gutters, box border and padding
  const each = Math.floor(
    (inner - 8 * (labelsAndHrefs.length - 1)) / labelsAndHrefs.length,
  );
  const cells = labelsAndHrefs.map(
    ([label, href]) =>
      `<td width="${each}" valign="top" class="btn-cell">${button(label, href, true)}</td>`,
  );
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr>${cells.join(
    `<td width="8" class="btn-gap" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`,
  )}</tr></table>`;
}

/** The Divider module: a 1px rule, spaced only by the sections either side (32px each). */
function rule(): string {
  return `<tr><td style="padding:0 32px;" class="gutter"><div style="height:1px;line-height:1px;font-size:1px;background:${INK};" class="rule">&nbsp;</div></td></tr>`;
}

function section(inner: string, extra = ""): string {
  return `<tr><td style="padding:32px 32px;${extra}" class="gutter">${inner}</td></tr>`;
}

/**
 * Two cells to a row at every width. Each cell is half the column, so on a
 * phone the tiles shrink rather than stack, with no media query needed.
 */
function pairs(cells: string[]): string {
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const [a, b] = [cells[i], cells[i + 1]];
    rows.push(
      `<tr><td width="50%" valign="top" style="width:50%;padding:0 8px ${i + 2 < cells.length ? 24 : 0}px 0;">${a}</td>` +
        `<td width="50%" valign="top" style="width:50%;padding:0 0 ${i + 2 < cells.length ? 24 : 0}px 8px;">${b ?? ""}</td></tr>`,
    );
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table>`;
}

/**
 * The Stats section. Totals sit four across as the grid tiles' stacks, a muted
 * label over a black figure; two outer cells of two each, so a phone makes it
 * two by two. The week's firsts are label and value rows, and a row with
 * nothing to report is left out rather than printed empty.
 */
function renderStats(s: ReportStats): string {
  const week = s.week ? renderWeek(s.week) : "";
  return [
    s.totals ? kicker("Stats") + renderTotals(s.totals) : "",
    // The week's rows carry no heading of their own, so without the totals
    // above them they take the section's.
    week && !s.totals ? kicker("Stats") + week : week,
  ]
    .filter(Boolean)
    .map((part, i) =>
      i ? `<div style="padding-top:24px;">${part}</div>` : part,
    )
    .join("");
}

function renderTotals(t: ReportTotals): string {
  const total = (label: string, value: number | null) =>
    value === null
      ? ""
      : `<div style="${LABEL}" class="muted">${label}</div><div style="${LINE}padding-top:2px;">${value.toLocaleString("en-US")}</div>`;
  const cells = [
    total("Restrooms", t.restrooms),
    total("Archivists", t.archivists),
    total("Countries", t.countries),
    total("Cities", t.cities),
  ];
  const half = (a: string, b: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="50%" valign="top" style="width:50%;">${a}</td><td width="50%" valign="top" style="width:50%;">${b}</td></tr></table>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="50%" valign="top" class="stat-half" style="width:50%;">${half(cells[0], cells[1])}</td>` +
    `<td width="50%" valign="top" class="stat-half" style="width:50%;">${half(cells[2], cells[3])}</td>` +
    `</tr></table>`
  );
}

/** The week's rows; a week with nothing new renders nothing at all. */
function renderWeek(s: ReportWeekStats): string {
  const rows = [
    [
      s.topArchivists.length > 1
        ? "Archivists of the week"
        : "Archivist of the week",
      s.topArchivists
        .map(
          (a) => `${a.name} (${a.count} ${a.count === 1 ? "scan" : "scans"})`,
        )
        .join(" · "),
    ],
    [
      s.newCountries.length > 1 ? "New countries" : "New country",
      s.newCountries.join(" · "),
    ],
    [
      s.newStates.length > 1 ? "New U.S. states" : "New U.S. state",
      s.newStates.join(" · "),
    ],
    [
      s.newCities.length > 1 ? "New cities" : "New city",
      s.newCities.join(" · "),
    ],
  ].filter(([, v]) => v);
  return rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows
        .map(
          ([label, value], i) =>
            `<tr><td width="176" valign="top" class="muted" style="${LABEL}width:176px;padding:${i ? 4 : 0}px 16px 0 0;">${label}</td><td valign="top" class="ink" style="${LINE}padding-top:${i ? 4 : 0}px;">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
}

/**
 * The masthead: the logo beside the archive's name, "Weekly Report", and a
 * line under it (the issue's week, in italics), when there is one.
 */
function masthead(siteUrl: string, subline?: string): string {
  return section(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td valign="middle" style="padding-right:16px;"><a href="${siteUrl}"><img src="${siteUrl}/newsletter/logo.png" width="56" height="56" alt="${SITE_NAME}" style="display:block;border:0;"></a></td>` +
      `<td valign="middle"><div style="${TITLE}font-weight:bold;">${SITE_NAME}</div><div style="${LINE}padding-top:2px;">Weekly Report</div>${subline ? `<div style="${TEXT}padding-top:2px;font-style:italic;">${escapeHtml(subline)}</div>` : ""}</td>` +
      `</tr></table>`,
  );
}

/** The footer's last line: the site, Instagram and the contact address. */
function footerLinks(siteUrl: string): string {
  const link = (label: string, href: string) =>
    `<a href="${escapeHtml(href)}" style="color:${INK};text-decoration:underline;" class="ink">${label}</a>`;
  return `<div style="${LINE}text-align:center;" class="ink">${link("The Restroom Archive", siteUrl)} · ${link("Instagram", "https://www.instagram.com/restroomarchive/")} · ${link(CONTACT_EMAIL, `mailto:${CONTACT_EMAIL}`)}</div>`;
}

/**
 * The page every Weekly Report email sits in: the grey canvas, the white
 * 600px column holding `blocks` (table rows), the footer under it, the
 * preheader, and the phone and dark-mode styles.
 */
function shell(o: {
  title: string;
  preheader: string;
  blocks: string[];
  footer: string;
  siteUrl: string;
}): string {
  return markSiteLinks(
    `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(o.title)}</title>
<style>
  body { margin:0; padding:0; }
  a { color:${INK}; }
  @media (max-width: 620px) {
    .container { width:100% !important; }
    .btn-cell { display:block !important; width:100% !important; padding-bottom:8px !important; }
    .btn-cell:last-child { padding-bottom:0 !important; }
    .btn-gap { display:none !important; }
    .stat-half { display:block !important; width:100% !important; }
    .stat-half + .stat-half { padding-top:16px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .canvas { background:#111111 !important; }
    .body, .box { background:#000000 !important; }
    .box { border-color:#ffffff !important; }
    .body div, .body p, .body a, .body td, .ink { color:#ffffff !important; }
    .muted, .body .muted { color:#999999 !important; }
    .rule { background:#ffffff !important; }
    .btn { background:#ffffff !important; }
    .body a.btn-text { color:#000000 !important; }
    .surface { background:#1a1a1a !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CANVAS};" class="canvas">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};" class="canvas"><tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;">
<tr><td style="background:${BODY};" class="body"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${o.blocks.join("\n")}
</table></td></tr>
<tr><td style="padding:32px;" class="gutter">${o.footer}</td></tr>
</table>
</td></tr></table>
</body>
</html>`,
    o.siteUrl,
  );
}

export function renderWeeklyReport(
  issue: WeeklyReportIssue,
  options: RenderOptions,
): string {
  const { siteUrl } = options;
  const unsubscribe = options.unsubscribeUrl ?? UNSUBSCRIBE_PLACEHOLDER;
  const entryUrl = (slug: string) => `${siteUrl}/r/${encodeURIComponent(slug)}`;
  const range = weekRangeLabel(issue.weekStart, issue.weekEnd);
  const blocks: string[] = [];

  blocks.push(masthead(siteUrl, range));

  const parts: string[] = [];

  // Updates: a headline, body and link, each 16px apart.
  if (issue.notes && (issue.notes.headline.trim() || issue.notes.body.trim())) {
    const n = issue.notes;
    const items = [
      n.headline.trim()
        ? `<div style="${TITLE}">${escapeHtml(n.headline)}</div>`
        : "",
      n.body.trim() ? prose(n.body) : "",
      n.linkUrl.trim()
        ? `<a href="${escapeHtml(abs(n.linkUrl, siteUrl))}" style="${TEXT}text-decoration:underline;">${escapeHtml(n.linkLabel.trim() || updateLinkFallback(n.linkUrl))}</a>`
        : "",
    ].filter(Boolean);
    parts.push(
      section(
        kicker("Updates") +
          items
            .map((item, i) =>
              i ? `<div style="padding-top:16px;">${item}</div>` : item,
            )
            .join(""),
      ),
    );
  }

  const stats = issue.stats ? renderStats(issue.stats) : "";
  if (stats) parts.push(section(stats));

  if (issue.featured) {
    const f = issue.featured;
    parts.push(
      section(
        kicker("Featured Restroom") +
          image(
            f.imageUrl,
            `3D scan of the restroom at ${f.name}, ${f.location}`,
            536,
            357,
            siteUrl,
            entryUrl(f.slug),
          ) +
          `<div style="padding-top:16px;">${stack([f.name, formatDayMonthYear(f.isoDate), f.location])}</div>` +
          (f.note.trim()
            ? `<div style="padding-top:16px;">${prose(f.note)}</div>`
            : ""),
      ),
    );
  }

  if (issue.submissions.length) {
    const tiles = issue.submissions.map(
      (s) =>
        image(
          s.imageUrl,
          `3D scan of the restroom at ${s.name}`,
          260,
          260,
          siteUrl,
          entryUrl(s.slug),
        ) +
        `<div style="padding-top:8px;">${stack([s.name, formatDayMonthYear(s.isoDate), s.location])}</div>`,
    );
    parts.push(section(kicker("New submissions") + pairs(tiles)));
  }

  // A Divider before each section; the call for scans follows the last
  // section without one, as in the design.
  for (const p of parts) blocks.push(rule(), p);

  // Call for scans: the about page's bordered aside.
  blocks.push(
    `<tr><td style="padding:0 32px 32px;" class="gutter"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="box" style="border:1px solid ${INK};padding:24px;">` +
      `<div style="${TITLE}padding-bottom:16px;text-align:center;">Contribute to The Restroom Archive</div>` +
      // `<p style="margin:0 0 16px;${TEXT}">Start scanning and become part of the Archive today.</p>` +
      buttonRow([
        ["Become an archivist", `${siteUrl}/account?signup`],
        ["Learn how to scan", `${siteUrl}/about?guide`],
        ["Submit a restroom", `${siteUrl}/submit`],
      ]) +
      `</td></tr></table></td></tr>`,
  );

  const footer =
    // The footer is set at the stacks' 130% (18px), not body copy's 150%.
    `<div style="${LABEL}padding-bottom:8px;text-align:center;" class="muted">You’re receiving this because you signed up at restroomarchive.com.<br>You can <a href="${unsubscribe}" style="color:${MUTED};text-decoration:underline;" class="muted">unsubscribe</a> from these emails at any time.</div>` +
    (WEEKLY_REPORT_MAILING_ADDRESS
      ? `<div style="${LABEL}padding-bottom:8px;" class="muted">${escapeHtml(WEEKLY_REPORT_MAILING_ADDRESS)}</div>`
      : "") +
    footerLinks(siteUrl);

  return shell({
    title: issue.subject,
    preheader: issue.preheader,
    blocks,
    footer,
    siteUrl,
  });
}

/**
 * The double opt-in email, sent when someone subscribes
 * (server/utils/email.ts). It is the newsletter's masthead, type and button,
 * so the first thing a subscriber gets already looks like the Weekly Report.
 * No unsubscribe link: until the button is clicked there's nothing to leave.
 */
export function renderWeeklyReportConfirm(
  confirmUrl: string,
  siteUrl: string,
): string {
  const blocks = [
    masthead(siteUrl),
    rule(),
    section(
      `<div style="${TITLE}">Confirm your subscription</div>` +
        `<div style="padding-top:16px;">${prose("Click below to start getting the Weekly Report: Archive highlights, new submissions and updates. The link works for 7 days.")}</div>` +
        `<div style="padding-top:16px;">${button("Confirm subscription", confirmUrl)}</div>`,
    ),
  ];
  const footer =
    `<div style="${LABEL}padding-bottom:8px;text-align:center;" class="muted">Someone signed up with this address.<br>If this wasn’t you, please feel free to ignore this email.</div>` +
    footerLinks(siteUrl);
  return shell({
    title: "Confirm your Weekly Report subscription",
    preheader: "One click and you’re on the list for the Weekly Report.",
    blocks,
    footer,
    siteUrl,
  });
}
