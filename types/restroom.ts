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
