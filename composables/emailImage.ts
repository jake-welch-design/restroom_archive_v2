/**
 * Shrinks an image the Weekly Report composer is about to upload, in the
 * browser, so the email carries what it shows and no more.
 *
 * Stills are drawn at twice the slot's displayed width (sharp on a 2x phone or
 * Retina screen) and saved as JPEG; GIFs are re-encoded frame by frame at the
 * slot's own width, with the studio's encoder, keeping the animation. Nothing
 * is ever enlarged, and a result that comes out no smaller than the original
 * is thrown away in favour of the original.
 *
 * Client-side because the alternative, Cloudflare's image resizing, is a paid
 * add-on, and the admin's browser is already holding the file.
 */

export type EmailImageSlot = "featured" | "tile";

/** Displayed widths in the email: the featured image and a grid tile. */
const SLOT_WIDTH: Record<EmailImageSlot, number> = { featured: 536, tile: 260 };

/** A GIF's frames are heavy, so it stays at 1x: the column's 600 at most. */
const GIF_WIDTH: Record<EmailImageSlot, number> = { featured: 600, tile: 260 };

const JPEG_QUALITY = 0.8;

export interface CompressedImage {
  file: File;
  /** The picked file's size, to report "before → after". */
  originalBytes: number;
  /** False when the original was kept: already small, or not decodable. */
  changed: boolean;
}

function scaled(width: number, height: number, maxWidth: number) {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.round((height * maxWidth) / width) };
}

function renamed(file: File, ext: string) {
  return file.name.replace(/\.[^.]+$/, "") + ext;
}

async function compressStill(file: File, slot: EmailImageSlot) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaled(
    bitmap.width,
    bitmap.height,
    SLOT_WIDTH[slot] * 2,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency: a PNG's clear pixels would otherwise go black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return null;
  return new File([blob], renamed(file, ".jpg"), { type: "image/jpeg" });
}

/**
 * Re-encodes an animated GIF at the slot's width. Needs ImageDecoder (Chrome
 * and Edge); elsewhere the GIF goes up as it is.
 */
async function compressGif(file: File, slot: EmailImageSlot) {
  if (typeof ImageDecoder === "undefined") return null;
  const decoder = new ImageDecoder({
    data: await file.arrayBuffer(),
    type: "image/gif",
  });
  await decoder.tracks.ready;
  const track = decoder.tracks.selectedTrack;
  if (!track) return null;
  const count = track.frameCount;
  const first = await decoder.decode({ frameIndex: 0 });
  const { width, height } = scaled(
    first.image.displayWidth,
    first.image.displayHeight,
    GIF_WIDTH[slot],
  );
  first.image.close();

  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  const gif = GIFEncoder();

  for (let i = 0; i < count; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    // VideoFrame duration is in microseconds; GIF delays are kept in 1/100 s.
    const delay = Math.max(20, Math.round((image.duration ?? 100_000) / 1000));
    image.close();
    const { data } = ctx.getImageData(0, 0, width, height);
    // A palette per frame, as the studio writes them: one table can't hold a
    // turntable's lighting across a whole turn.
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), width, height, {
      palette,
      delay,
      ...(i === 0 ? { repeat: track.repetitionCount === 0 ? -1 : 0 } : {}),
    });
  }
  decoder.close();
  gif.finish();
  return new File([gif.bytes()], renamed(file, ".gif"), { type: "image/gif" });
}

export async function compressForEmail(
  file: File,
  slot: EmailImageSlot,
): Promise<CompressedImage> {
  const original = { file, originalBytes: file.size, changed: false };
  let out: File | null;
  try {
    out =
      file.type === "image/gif"
        ? await compressGif(file, slot)
        : await compressStill(file, slot);
  } catch {
    // An image the browser can't decode goes up as it is; the server still
    // checks its type and size.
    return original;
  }
  if (!out || out.size >= file.size) return original;
  return { file: out, originalBytes: file.size, changed: true };
}
