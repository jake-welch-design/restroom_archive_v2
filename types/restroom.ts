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
  lat: number | null;
  lng: number | null;
  date: string;
  isoDate: string;
  description: string | null;
  descriptors: string[];
  submitter: PublicUserRef | null;
  status: string;
  /** The admin's crop, or null for a scan framed on its own bounds. */
  crop: Crop | null;
  modelUrl: string;
  thumbUrl: string | null;
}
