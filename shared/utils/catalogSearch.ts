/**
 * The catalog's search box.
 *
 * Every word of the query has to be found somewhere in a listing, and each one
 * can be found in a different field: "spain 2025" is a place and a year, and
 * "brooklyn tile" a city and a word from a description. A word is found when it
 * begins a word of the listing ("barc" finds Barcelona), or, from four letters
 * up, when it is a typo away from one ("barcelna").
 *
 * What a listing is searched by is wider than what it shows. The location reads
 * "Madrid, ES" and "Austin, TX", so the country and state behind those codes are
 * indexed by name as well, from the row's own `country` column rather than by
 * parsing the display string. The date is indexed as shown, with the month
 * spelled out, and as ISO.
 *
 * The same rules mark what matched in the listing as it is shown (see
 * markMatches), so the highlight never disagrees with why a row is there.
 *
 * Fuse.js did this before, over the name, the location and the date only, with
 * its default penalty on matches far into a field, which is why a description
 * was out of reach even had it been a key.
 */
import { formatDayMonthYear } from "./formatDate";
import {
  countryName,
  subdivisionFromLocation,
  subdivisionsFor,
} from "./regions";

/** The fields of a catalog row that search reads. */
export interface Searchable {
  name: string;
  location: string;
  country: string | null;
  date: string;
  isoDate: string;
  description: string | null;
  descriptors: string[] | null;
  submitter: { username: string; displayName: string | null } | null;
}

/**
 * How much a word found in each field counts towards a row's rank, among
 * matches equally good (see wordMatch). Only the order matters: a query that
 * names a place should list the places called that before the ones whose
 * description mentions it. Kept under 10 so it never outweighs match quality.
 */
const WEIGHT = {
  name: 6,
  place: 5,
  tags: 4,
  date: 3,
  submitter: 3,
  description: 1,
} as const;

type Field = keyof typeof WEIGHT;

/**
 * Other names a country goes by. The archive files under ISO codes and the
 * names a reader would look for, but some places are looked for by a third.
 */
const COUNTRY_ALIASES: Record<string, readonly string[]> = {
  US: ["USA", "United States of America", "America"],
  GB: ["UK", "Britain", "Great Britain", "England", "Scotland", "Wales"],
  AE: ["UAE"],
  NL: ["Holland"],
  CZ: ["Czech Republic", "Czechia"],
  KR: ["Korea"],
};

/** One word of a text, normalised, with where it sits in the original. */
interface Token {
  norm: string;
  start: number;
  /** `ends[k]`: the original offset just past the k-th normalised character. */
  ends: number[];
}

/**
 * Lowercased, accents and apostrophes dropped, split at everything else:
 * "McDonald's, Malmö" is `mcdonalds`, `malmo`. Queries go through the same
 * function, so typing either spelling finds both.
 *
 * Done a character at a time rather than over the whole string so that each
 * word keeps its offsets in the original, which is what lets a highlight land
 * on "Malmö" for a query of "malm".
 */
function tokenize(text: string | null | undefined): Token[] {
  const out: Token[] = [];
  if (!text) return out;
  let cur: Token | null = null;
  let at = 0;
  for (const ch of text) {
    const next = at + ch.length;
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
    if (!base) {
      // A combining mark on its own belongs to the letter before it.
      if (cur) cur.ends[cur.ends.length - 1] = next;
    } else if (ch === "'" || ch === "’") {
      // Dropped, without ending the word: "joe's" is `joes`.
    } else if (/^[\p{L}\p{N}]+$/u.test(base)) {
      cur ??= { norm: "", start: at, ends: [] };
      for (const c of base.toLowerCase()) {
        cur.norm += c;
        cur.ends.push(next);
      }
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
    at = next;
  }
  if (cur) out.push(cur);
  return out;
}

function words(text: string | null | undefined): string[] {
  return tokenize(text).map((t) => t.norm);
}

/** Full month name, for "march" as well as the "Mar" the catalog shows. */
function monthName(isoDate: string): string {
  const m = /^\d{4}-(\d{2})/.exec(isoDate);
  if (!m) return "";
  return new Date(Date.UTC(2000, Number(m[1]) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * The names behind a location's codes: the country's, and the state's or
 * province's where the trailing token is one.
 */
function placeNames(location: string, country: string | null) {
  if (!country) return { country: [], region: null };
  // "Austin, TX" -> Texas. Only where the trailing token is a subdivision by
  // construction (see composeLocation), so "CA" is California on a US row and
  // nothing on any other.
  const sub = subdivisionFromLocation(location);
  const region = subdivisionsFor(country)?.find((r) => r.code === sub);
  return {
    country: [
      country,
      countryName(country) ?? "",
      ...(COUNTRY_ALIASES[country] ?? []),
    ],
    region: region?.name ?? null,
  };
}

/** Everything a row can be found by, as words per field. */
function indexRow(row: Searchable): Record<Field, string[]> {
  const names = placeNames(row.location, row.country);
  const place = [row.location, ...names.country, names.region ?? ""];

  return {
    name: words(row.name),
    place: words(place.join(" ")),
    tags: words((row.descriptors ?? []).join(" ")),
    date: words(
      [
        row.date,
        row.isoDate,
        formatDayMonthYear(row.isoDate),
        monthName(row.isoDate),
      ].join(" "),
    ),
    submitter: words(
      row.submitter
        ? `${row.submitter.username} ${row.submitter.displayName ?? ""}`
        : "",
    ),
    description: words(row.description),
  };
}

/** Levenshtein distance, giving up once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * How well one query word matches one listing word: 3 for the whole word, 2
 * for its start, 1 for a typo away, 0 for no match. Short words get no typo
 * allowance either way, or "es" would find every "is" and "as", and "deco"
 * the "Dec" of a date. A typo in the start of a longer word needs five
 * letters, or "deco" would find "dece(mber)".
 */
function wordMatch(q: string, w: string): number {
  if (w === q) return 3;
  if (w.startsWith(q)) return 2;
  if (q.length < 4 || w.length < 4) return 0;
  const max = q.length >= 8 ? 2 : 1;
  if (editDistance(q, w, max) <= max) return 1;
  if (
    q.length >= 5 &&
    w.length > q.length &&
    editDistance(q, w.slice(0, q.length), max) <= max
  )
    return 1;
  return 0;
}

/** A word of the query, as the catalog matched it. */
export interface SearchTerm {
  text: string;
  /**
   * Found nowhere in the catalog as typed, so matched on near misses instead.
   * A highlight has to know, or "brooklin" would light up nothing in the
   * Brooklyn rows it found.
   */
  typo: boolean;
}

export interface SearchResult<T> {
  /** Rows matching every word of the query, best first. */
  rows: T[];
  terms: SearchTerm[];
}

export interface CatalogSearch<T> {
  search(query: string): SearchResult<T>;
}

export function createCatalogSearch<T extends Searchable>(
  rows: readonly T[],
): CatalogSearch<T> {
  const index = rows.map((row) => ({ row, fields: indexRow(row) }));
  const fields = Object.keys(WEIGHT) as Field[];

  return {
    search(query) {
      const terms = [...new Set(words(query))];
      if (!terms.length) return { rows: [...rows], terms: [] };

      // Each row's best score for each term. How well a word matched outranks
      // where it matched: an exact word in a description beats a typo in a
      // name, so the tens are the match and the units the field.
      const scored = index.map(({ fields: f }) =>
        terms.map((q) => {
          let best = 0;
          for (const field of fields) {
            for (const w of f[field]) {
              const m = wordMatch(q, w);
              const s = m && m * 10 + WEIGHT[field];
              if (s > best) best = s;
            }
          }
          return best;
        }),
      );

      // Typos are a fallback. A term spelled right somewhere in the catalog
      // ("spain") is held to that, or every "span" and "spin" in a description
      // would come with it; one found nowhere ("brooklin") is let through on a
      // near miss.
      const floor = terms.map((_, t) =>
        scored.some((s) => s[t]! >= 20) ? 20 : 10,
      );

      const hits: { row: T; score: number; at: number }[] = [];
      scored.forEach((s, at) => {
        // Every word has to be found somewhere.
        if (s.every((v, t) => v >= floor[t]!))
          hits.push({
            row: index[at]!.row,
            score: s.reduce((a, b) => a + b),
            at,
          });
      });

      // Ties keep the order the rows came in, which is the catalog's sort.
      hits.sort((a, b) => b.score - a.score || a.at - b.at);
      return {
        rows: hits.map((h) => h.row),
        terms: terms.map((text, t) => ({ text, typo: floor[t] === 10 })),
      };
    },
  };
}

/** A run of displayed text, and whether it is part of a match. */
export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Displayed words that stand for others, keyed by the displayed word: the "ES"
 * of "Madrid, ES" for Spain, the "Mar" of a date for March.
 */
export type Aliases = Readonly<Record<string, readonly string[]>>;

/** Whether `term` finds `word` by the same rule the search used. */
function termFinds(term: SearchTerm, word: string): boolean {
  return wordMatch(term.text, word) >= (term.typo ? 1 : 2);
}

/**
 * Splits displayed text into the parts the query matched and the rest.
 *
 * What is marked is what was typed: "barc" marks the "Barc" of Barcelona, not
 * the whole word. A word matched as a whole (a typo, or an alias) is marked
 * whole, since there is no typed part of it to pick out.
 */
export function markMatches(
  text: string,
  terms: readonly SearchTerm[],
  aliases?: Aliases,
): Segment[] {
  if (!text || !terms.length) return [{ text, hit: false }];

  const ranges: [number, number][] = [];
  for (const tok of tokenize(text)) {
    let len = 0;
    for (const t of terms) {
      if (tok.norm.startsWith(t.text)) len = Math.max(len, t.text.length);
      else if (t.typo && termFinds(t, tok.norm)) len = tok.norm.length;
    }
    const stands = aliases?.[tok.norm];
    if (stands?.some((w) => terms.some((t) => termFinds(t, w))))
      len = tok.norm.length;
    if (len) ranges.push([tok.start, tok.ends[len - 1]!]);
  }
  if (!ranges.length) return [{ text, hit: false }];

  const out: Segment[] = [];
  let at = 0;
  for (const [from, to] of ranges) {
    if (from > at) out.push({ text: text.slice(at, from), hit: false });
    out.push({ text: text.slice(from, to), hit: true });
    at = to;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}

/**
 * A location's trailing code, standing for the place it abbreviates. "TX" on a
 * US row stands for Texas; "ES" for Spain. A US or Canadian row's trailing
 * token is its state or province, so its country names have nothing displayed
 * to mark.
 */
export function locationAliases(location: string, country: string | null) {
  const code = subdivisionFromLocation(location);
  const names = placeNames(location, country);
  const stands = names.region
    ? [names.region]
    : code === country
      ? names.country
      : [];
  return stands.length
    ? { [code.toLowerCase()]: words(stands.join(" ")) }
    : undefined;
}

/**
 * A date's month as shown ("Mar") standing for its full name and its number,
 * which is how "march" and "2025-03" find it. Built with the same formatter as
 * the date it marks, so whatever this runtime abbreviates September to is the
 * key.
 */
export const DATE_ALIASES: Aliases = Object.fromEntries(
  Array.from({ length: 12 }, (_, m) => {
    const day = new Date(Date.UTC(2000, m, 1));
    const name = (month: "short" | "long") =>
      day.toLocaleString("en-US", { month, timeZone: "UTC" }).toLowerCase();
    return [name("short"), [name("long"), String(m + 1).padStart(2, "0")]];
  }),
);
