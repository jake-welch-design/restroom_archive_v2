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
 * Encoding a turntable to MP4, and getting the file onto disk.
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

/** One turn, or part of one, of whatever the stage has loaded, as its own MP4. */
export async function encodeTurntable(
  stage: TurntableStage,
  canvas: HTMLCanvasElement,
  frame: StudioFrame,
  options: TurnOptions,
): Promise<Blob> {
  const video = await openTurntableVideo(stage, canvas, frame);
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

/** `turntable-12-three-quarter-9x16.mp4`, for a batch exported as one video. */
export function studioReelFileName(count: number, frame: StudioFrame): string {
  return `turntable-${count}-${frame.view}-${frame.aspect.replace(":", "x")}.mp4`;
}

/** `good-fork-three-quarter-9x16.mp4` */
export function studioFileName(
  slug: string,
  frame: StudioFrame,
  /** 1-based place in a continuous sequence, so the files sort in order. */
  sequence?: number,
): string {
  const prefix = sequence ? `${String(sequence).padStart(2, "0")}-` : "";
  return `${prefix}${slug}-${frame.view}-${frame.aspect.replace(":", "x")}.mp4`;
}
