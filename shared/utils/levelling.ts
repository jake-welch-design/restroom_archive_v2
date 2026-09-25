/**
 * Levelling a scan: the rotation that stands it upright, and what that rotation
 * does to everything already placed against it.
 *
 * Written without three.js so the server can use it. The crop endpoint moves a
 * scan's annotations through a change of rotation and centre, and it has to do
 * that from the rows in the database rather than trust a client's copy of them,
 * which could be missing any added since the page loaded.
 *
 * The viewer's transform chain, which every function here follows:
 *
 *     world = Ry(θ) · L − C          model group: position −C, rotation.y θ
 *     L     = R · (q − p) + p        level node:  rotation R about pivot p
 *
 * q is a point in the GLB as exported. L is the scan's levelled local space,
 * which is where crop boxes, the POV eye height and annotation points are all
 * stored. θ is the model's turn about Y (auto-rotate, or an annotation's stored
 * turn) and C is the centre of the box the viewer frames on.
 *
 * That first line is the convention annotation cameras are stored in, not what
 * the viewer draws. The viewer turns the scan about C, world = Ry(θ) · (L − C),
 * so the frame's centre stays on the orbit pivot, and converts cameras by
 * C − Ry(θ) · C when it saves or flies to one (storedCameraOffset in
 * composables/useThreeScene.ts). At θ = 0 the two agree.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A unit quaternion. */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * The rotation that levels a scan, and the point it turns about.
 *
 * The pivot is part of the stored value rather than re-measured at load, so the
 * levelled space is fully defined by what is saved and does not shift if the
 * way bounds are measured ever changes. It is fixed when a scan is first
 * rotated and kept for every rotation after, so successive rotations compose.
 */
export interface Level {
  rotation: Quat;
  pivot: Vec3;
}

export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** The inverse, for a unit quaternion. */
export function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function quatNormalize(q: Quat): Quat {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

/** The same turn about Y that `object.rotation.y = angle` makes in three.js. */
export function quatAboutY(angle: number): Quat {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w(u × v) + 2u × (u × v), with u the quaternion's vector part.
  const cx = q.y * v.z - q.z * v.y;
  const cy = q.z * v.x - q.x * v.z;
  const cz = q.x * v.y - q.y * v.x;
  return {
    x: v.x + 2 * (q.w * cx + q.y * cz - q.z * cy),
    y: v.y + 2 * (q.w * cy + q.z * cx - q.x * cz),
    z: v.z + 2 * (q.w * cz + q.x * cy - q.y * cx),
  };
}

const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

/**
 * Whether a level turns the scan at all.
 *
 * Within a hundredth of a degree counts as not, so a rotation dragged away and
 * back is stored as no levelling rather than as a rotation that happens to be
 * almost nothing. |w| because q and −q are the same rotation.
 */
export function isLevelled(level: Level | null | undefined): level is Level {
  if (!level) return false;
  const angle = 2 * Math.acos(Math.min(1, Math.abs(level.rotation.w)));
  return angle > (0.01 * Math.PI) / 180;
}

/**
 * The camera's forward direction for a POV annotation's stored angles.
 *
 * The camera looks down −Z and turns yaw about Y, then pitch about X, the
 * YXZ order the viewer uses for POV.
 */
export function povDirection(pitch: number, yaw: number): Vec3 {
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}

export function povAngles(d: Vec3): { pitch: number; yaw: number } {
  const length = Math.hypot(d.x, d.y, d.z) || 1;
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, d.y / length))),
    yaw: Math.atan2(-d.x, -d.z),
  };
}

/** The frame the viewer draws a scan in: its levelling and its centre. */
export interface Framing {
  level: Level | null;
  centre: Vec3;
}

/** The fields of an annotation that locate it against the scan. */
export interface AnnotationPlacement {
  pointX: number;
  pointY: number;
  pointZ: number;
  cameraMode: string;
  orbitPosX: number | null;
  orbitPosY: number | null;
  orbitPosZ: number | null;
  orbitTargetX: number | null;
  orbitTargetY: number | null;
  orbitTargetZ: number | null;
  rotationX: number | null;
  rotationY: number | null;
  modelRotationY: number | null;
}

/**
 * Where an annotation has to move so it still marks, and still frames, the
 * same part of the scan after its framing changes.
 *
 * The point is in levelled local space, so only a change of rotation moves it,
 * by the relative rotation N = R_after · R_before⁻¹ about the pivot:
 *
 *     L' = N · (L − p) + p
 *
 * An orbit camera is in world space, so it is carried by the rigid motion the
 * scan itself makes on screen. For a raw point q at the annotation's stored
 * turn θ, eliminating q from world = Ry(θ) · L − C before and after gives
 *
 *     W' = M · (W + C_before) + Ry(θ) · (p − N · p) − C_after,
 *     M  = Ry(θ) · N · Ry(θ)⁻¹
 *
 * Camera position and target both go through it, so the camera still looks at
 * the same surface from the same place relative to it. The camera's up stays
 * world Y, which is the point of levelling: the view is the same, minus the
 * tilt.
 *
 * A POV annotation stores no position, only the direction it looks, so the
 * direction goes through M and the eye stands wherever POV now stands. With
 * no change of rotation M is the identity and this reduces to shifting orbit
 * cameras by C_before − C_after, which is exactly the re-centre alone.
 */
export function reframeAnnotation(
  a: AnnotationPlacement,
  before: Framing,
  after: Framing,
): AnnotationPlacement {
  const rBefore = before.level?.rotation ?? IDENTITY_QUAT;
  const rAfter = after.level?.rotation ?? IDENTITY_QUAT;
  // One pivot for both sides. Whichever side is levelled owns it, and when both
  // are, it is the same stored pivot; an unlevelled side ignores it anyway.
  const pivot = after.level?.pivot ?? before.level?.pivot ?? ORIGIN;

  const n = quatNormalize(quatMultiply(rAfter, quatConjugate(rBefore)));
  const turn = quatAboutY(a.modelRotationY ?? 0);
  const m = quatMultiply(quatMultiply(turn, n), quatConjugate(turn));
  const shift = sub(rotate(turn, sub(pivot, rotate(n, pivot))), after.centre);

  const point = add(
    rotate(n, sub({ x: a.pointX, y: a.pointY, z: a.pointZ }, pivot)),
    pivot,
  );
  const carry = (v: Vec3) => add(rotate(m, add(v, before.centre)), shift);

  const next: AnnotationPlacement = {
    ...a,
    pointX: point.x,
    pointY: point.y,
    pointZ: point.z,
  };

  if (a.orbitPosX != null && a.orbitPosY != null && a.orbitPosZ != null) {
    const pos = carry({ x: a.orbitPosX, y: a.orbitPosY, z: a.orbitPosZ });
    next.orbitPosX = pos.x;
    next.orbitPosY = pos.y;
    next.orbitPosZ = pos.z;
  }
  if (
    a.orbitTargetX != null &&
    a.orbitTargetY != null &&
    a.orbitTargetZ != null
  ) {
    const target = carry({
      x: a.orbitTargetX,
      y: a.orbitTargetY,
      z: a.orbitTargetZ,
    });
    next.orbitTargetX = target.x;
    next.orbitTargetY = target.y;
    next.orbitTargetZ = target.z;
  }
  if (a.cameraMode === "pov" && a.rotationX != null && a.rotationY != null) {
    const { pitch, yaw } = povAngles(
      rotate(m, povDirection(a.rotationX, a.rotationY)),
    );
    next.rotationX = pitch;
    next.rotationY = yaw;
  }

  return next;
}
