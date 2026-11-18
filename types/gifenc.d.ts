// gifenc ships no types. Only the parts the studio uses are declared.
declare module "gifenc" {
  export type GifPalette = number[][];
  export type GifFormat = "rgb565" | "rgb444" | "rgba4444";

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: GifFormat },
  ): GifPalette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: GifFormat,
  ): Uint8Array;

  export interface GifFrameOptions {
    /**
     * Required on the first frame, where it becomes the global colour table.
     * On any later frame it is written as that frame's local table.
     */
    palette?: GifPalette;
    /** Milliseconds, stored in hundredths of a second. */
    delay?: number;
    /** -1 plays once, 0 loops forever. Read on the first frame only. */
    repeat?: number;
  }

  export interface GifEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: GifFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  }

  export function GIFEncoder(): GifEncoderInstance;
}
