export type CameraMode = 'orbit' | 'pov'

export interface AnnotationAuthor {
  id: number
  displayName: string | null
  email: string
}

export interface Annotation {
  id: number
  restroomId: number
  body: string
  pointX: number
  pointY: number
  pointZ: number
  cameraMode: CameraMode
  cameraFov: number
  orbitPosX: number | null
  orbitPosY: number | null
  orbitPosZ: number | null
  orbitTargetX: number | null
  orbitTargetY: number | null
  orbitTargetZ: number | null
  rotationX: number | null
  rotationY: number | null
  modelRotationY: number | null
  createdAt: string
  author: AnnotationAuthor
}
