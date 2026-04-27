export interface PublicUserRef {
  username: string
  displayName: string | null
}

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
  submitter: PublicUserRef | null
  status: string
  modelUrl: string
  thumbUrl: string | null
}
