import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
} from "mediabunny";
import {
  STUDIO_ASPECTS,
  type StudioAspect,
  type StudioFrame,
  type TurntableStage,
} from "~/composables/turntableStage";

/**
 * Encoding a turntable to MP4 or GIF, and getting the file onto disk.
 *
 * GIFs are for email, where video does not play; see `openTurntableGif`.
 *
 * WebCodecs does the encoding in the browser, so nothing is uploaded and there
 * is no server or ffmpeg involved. H.264 in MP4 because that is what Instagram
 * takes without re-encoding complaints, and what Chrome and Safari can both
 * encode. Firefox cannot encode H.264 on every platform, which `canExport`
 * reports up front rather than failing at the first frame.
 */

export const STUDIO_FPS = 30;
/**
 * Comfortably above what Instagram re-encodes stories to, so its pass is the
 * only lossy one that shows. A scan's fine texture is what suffers first.
 */
const BITRATE = 12_000_000;

export async function canExport(aspect: StudioAspect): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  const { width, height } = STUDIO_ASPECTS[aspect];
  try {
    return await canEncodeVideo("avc", {
      width,
      height,
      bitrate: BITRATE,
      frameRate: STUDIO_FPS,
    });
  } catch {
    return false;
  }
}

export interface TurnOptions {
  seconds: number;
  /** Where the clip starts, as a fraction of a rotation. 0 by default. */
  from?: number;
  /** How much of a rotation the clip covers. 1, a full turn, by default. */
  span?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/**
 * An MP4 being written, one turntable rotation after another.
 *
 * Each turn follows straight on from the last, a hard cut, so a batch can go
 * out as one video as easily as one clip each. Every turn has to share the
 * first one's output size, which the batch's single aspect ratio guarantees.
 */
export interface TurntableVideo {
  /**
   * Renders `seconds` of whatever the stage has loaded: one full rotation by
   * default, or, given `from` and `span`, the stretch of the rotation starting
   * `from` of the way round and covering `span` of it.
   */
  addTurn(frame: StudioFrame, options: TurnOptions): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
}

/**
 * Starts an MP4 at `frame`'s size. The stage should already hold the first
 * scan to be added.
 */
export async function openTurntableVideo(
  stage: TurntableStage,
  canvas: HTMLCanvasElement,
  frame: StudioFrame,
): Promise<TurntableVideo> {
  const step = 1 / STUDIO_FPS;

  // The canvas has to be at the output size before the source is built, since
  // the encoder takes its dimensions from the first frame.
  stage.render(frame, 0);

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: BITRATE,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: STUDIO_FPS });
  await output.start();

  /** Frames written so far, so the next turn's timestamps carry on from them. */
  let written = 0;

  return {
    async addTurn(frame, options) {
      const frames = Math.round(options.seconds * STUDIO_FPS);
      const from = options.from ?? 0;
      const span = options.span ?? 1;
      // Frame i is `i / frames` of the way through the span and the last frame
      // stops one step short of its end. A full turn played on a loop never
      // stutters at the seam, and a partial one hands over to a clip starting
      // at `from + span` without a repeated frame.
      for (let i = 0; i < frames; i++) {
        if (options.signal?.aborted)
          throw new DOMException("Aborted", "AbortError");
        stage.render(frame, from + (span * i) / frames);
        // Awaited for backpressure: the encoder runs behind the renderer, and
        // without the wait every frame would queue at once.
        await source.add((written + i) * step, step);
        options.onProgress?.((i + 1) / frames);
      }
      written += frames;
    },

    async finish() {
      await output.finalize();
      const buffer = (output.target as BufferTarget).buffer;
      if (!buffer) throw new Error("The encoder produced no file.");
      return new Blob([buffer], { type: "video/mp4" });
    },

    async cancel() {
      await output.cancel().catch(() => {});
    },
  };
}

/* --- GIF ------------------------------------------------------------------- */

/**
 * GIF frame rates. A GIF stores each frame's delay in hundredths of a second,
 * so only rates that divide 100 play back at the speed they were rendered at:
 * 15 fps would be stored as 7/100 s a frame and run 5% slow, and the loop
 * would no longer last the turn's length.
 */
export const GIF_FPS_OPTIONS = [10, 20, 25] as const;
export type GifFps = (typeof GIF_FPS_OPTIONS)[number];

/**
 * Output widths. GIFs are sized for where they are going rather than rendered
 * at Instagram's 1080: a newsletter column is 536–600 px wide, and every extra
 * pixel costs file size, which email clients punish long before video sites do.
 */
export const GIF_WIDTH_OPTIONS = [480, 600, 800, 1080] as const;
export type GifWidth = (typeof GIF_WIDTH_OPTIONS)[number];

/** The GIF's pixel size: `width` across, the frame's ratio down. */
export function gifSize(aspect: StudioAspect, width: number) {
  const full = STUDIO_ASPECTS[aspect];
  return { width, height: Math.round((width * full.height) / full.width) };
}

/** How many angles of a turn are sampled to choose its 256 colours. */
const PALETTE_SAMPLES = 8;

/**
 * A GIF being written, with the same shape as the MP4 so the studio's batch
 * and one-file modes drive it the same way.
 *
 * GIF allows 256 colours, so each turn gets its own palette, sampled from a
 * handful of its own angles before its frames are encoded. Sampling the whole
 * turn rather than its first frame keeps the walls that only come into view
 * halfway round from being forced into colours chosen for the opening view.
 * The first turn's palette is the file's global table; a later turn's goes on
 * each of its frames as a local one, which costs 768 bytes a frame but keeps
 * one restroom's colours from being squeezed into another's.
 *
 * No dithering: on a slowly turning scan, dither noise shimmers frame to frame
 * and costs far more in file size than the banding it hides.
 */
export async function openTurntableGif(
  stage: TurntableStage,
  canvas: HTMLCanvasElement,
  frame: StudioFrame,
  options: { width: number; fps: number },
): Promise<TurntableVideo> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const { width, height } = gifSize(frame.aspect, options.width);
  const delay = 1000 / options.fps;

  const small = document.createElement("canvas");
  small.width = width;
  small.height = height;
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  /** Renders the stage at `turn` and reads it back at the GIF's size. */
  function grab(f: StudioFrame, turn: number) {
    stage.render(f, turn);
    ctx.drawImage(canvas, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  }

  // The encoder is synchronous; handing the main thread back now and then
  // keeps the progress bar and the Cancel button alive.
  const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

  const gif = GIFEncoder();
  let first = true;

  return {
    async addTurn(f, turnOptions) {
      const frames = Math.round(turnOptions.seconds * options.fps);
      const from = turnOptions.from ?? 0;
      const span = turnOptions.span ?? 1;
      const angle = (i: number) => from + (span * i) / frames;

      const samples = Math.min(PALETTE_SAMPLES, frames);
      const sampled = new Uint8ClampedArray(width * height * 4 * samples);
      for (let s = 0; s < samples; s++) {
        if (turnOptions.signal?.aborted)
          throw new DOMException("Aborted", "AbortError");
        const i = Math.floor((s * frames) / samples);
        sampled.set(grab(f, angle(i)), s * width * height * 4);
      }
      const palette = quantize(sampled, 256);
      const local = !first;

      for (let i = 0; i < frames; i++) {
        if (turnOptions.signal?.aborted)
          throw new DOMException("Aborted", "AbortError");
        const index = applyPalette(grab(f, angle(i)), palette);
        gif.writeFrame(index, width, height, {
          palette: first || local ? palette : undefined,
          delay,
          repeat: 0,
        });
        first = false;
        turnOptions.onProgress?.((i + 1) / frames);
        if (i % 4 === 3) await breathe();
      }
    },

    async finish() {
      if (first) throw new Error("The GIF has no frames.");
      gif.finish();
      return new Blob([gif.bytes()], { type: "image/gif" });
    },

    async cancel() {},
  };
}

/* --- Either --------------------------------------------------------------- */

/**
 * One turn, or part of one, of whatever the stage has loaded, as its own file,
 * written by `video`, which has just been opened on `frame`.
 */
export async function encodeTurntable(
  video: TurntableVideo,
  frame: StudioFrame,
  options: TurnOptions,
): Promise<Blob> {
  try {
    await video.addTurn(frame, options);
    return await video.finish();
  } catch (e) {
    await video.cancel();
    throw e;
  }
}

/* --- Saving ----------------------------------------------------------------- */

/**
 * Where finished files go: a folder the admin picked, written straight into,
 * or, where the browser has no folder access (Safari, Firefox), the downloads
 * bar one file at a time.
 */
export interface StudioSink {
  save(name: string, blob: Blob): Promise<void>;
  /** Shown beside the export button, so it is clear where files are landing. */
  label: string;
}

type DirectoryPicker = (options?: {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: string;
}) => Promise<FileSystemDirectoryHandle>;

export function canPickFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickFolderSink(): Promise<StudioSink> {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker })
    .showDirectoryPicker;
  // `id` makes the picker reopen where it was last pointed.
  const dir = await picker({
    id: "restroom-studio",
    mode: "readwrite",
    startIn: "videos",
  });
  return {
    label: dir.name,
    async save(name, blob) {
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    },
  };
}

export const downloadSink: StudioSink = {
  label: "Downloads",
  async save(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    // Revoked on a delay: revoking straight away can cancel the download
    // before the browser has started reading the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

export type StudioFileType = "mp4" | "gif";

/** `turntable-12-three-quarter-9x16.mp4`, for a batch exported as one file. */
export function studioReelFileName(
  count: number,
  frame: StudioFrame,
  type: StudioFileType,
): string {
  return `turntable-${count}-${frame.view}-${frame.aspect.replace(":", "x")}.${type}`;
}

/** `good-fork-three-quarter-9x16.mp4` */
export function studioFileName(
  slug: string,
  frame: StudioFrame,
  type: StudioFileType,
  /** 1-based place in a continuous sequence, so the files sort in order. */
  sequence?: number,
): string {
  const prefix = sequence ? `${String(sequence).padStart(2, "0")}-` : "";
  return `${prefix}${slug}-${frame.view}-${frame.aspect.replace(":", "x")}.${type}`;
}

/** `1.4 MB`, `640 KB` */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
