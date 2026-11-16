import type { Crop } from "~~/shared/utils/crop";

export interface PublicUserRef {
  username: string;
  displayName: string | null;
}

export interface RestroomSummary {
  id: number;
  slug: string;
  name: string;
  location: string;
  /**
   * ISO 3166-1 alpha-2. Null only on rows predating the country column -- see
   * shared/utils/regions.ts. `location` is the display string; this is what the
   * archive counts by.
   */
  country: string | null;
  /**
   * The catalog entry this scan belongs to, shared by every scan of one place.
   * Opaque, not a URL; see shared/utils/versions.ts.
   */
  establishment: string;
  lat: number | null;
  lng: number | null;
  date: string;
  isoDate: string;
  description: string | null;
  descriptors: string[];
  submitter: PublicUserRef | null;
  status: string;
  /**
   * When the scan was submitted (SQLite `datetime('now')`, UTC, sortable as a
   * string). Distinct from `isoDate`, which is when the scan was taken.
   */
  createdAt: string;
  /** The admin's crop, or null for a scan framed on its own bounds. */
  crop: Crop | null;
  modelUrl: string;
  thumbUrl: string | null;
}

/** One of a combined entry's archive dates, as its date picker lists it. */
export interface ArchiveDate {
  slug: string;
  isoDate: string;
}

/**
 * A catalog row: one scan, plus the archive dates of the entry it belongs to.
 * Every scan is its own row in the list and grid; the dates are what link a
 * combined entry's rows, and what the map collapses its pins by.
 */
export interface CatalogRow extends RestroomSummary {
  /** The entry this scan belongs to; shared by its other dates' rows. */
  groupKey: string;
  /** Every published scan of the entry, oldest first. One for most. */
  scans: ArchiveDate[];
}
