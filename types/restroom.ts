export interface RestroomSummary {
  id: number
  slug: string
  name: string
  location: string
  coords: string
  lat: number | null
  lng: number | null
  date: string
  isoDate: string
  description: string | null
  descriptors: string[]
  attribution: string
  status: string
  modelUrl: string
  thumbUrl: string | null
}
