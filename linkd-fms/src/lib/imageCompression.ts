/**
 * Client-side image compression for upload pipelines.
 *
 * Goals
 *  - Shrink large JPEG/PNG/WebP photos before they hit Supabase Storage
 *  - Never block PSD / PDF / video / AI files — designers need the originals
 *  - Fail silently: if the canvas pipeline errors for any reason (CORS,
 *    out-of-memory on a huge PNG, etc.) we hand the caller the original
 *    file so the upload still succeeds.
 *
 * Used by every upload handler (BriefingView, TaskDetailDrawer,
 * SubmitConceptDialog, SamplingFormDrawer, FullKittingDrawer).
 */

const COMPRESSIBLE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MIN_BYTES_TO_COMPRESS = 500 * 1024; // 500 KB

/**
 * Resize + recompress an image client-side. Returns a new File with the same
 * name. If the file isn't a compressible image, or is already small, or the
 * canvas pipeline fails for any reason, the original file is returned.
 *
 * @param file       The source file (any type — non-images pass through)
 * @param maxWidth   Cap on the longest edge. The other edge scales to preserve
 *                   aspect ratio. Default 1920 — enough for 4K-ish display.
 * @param quality    JPEG/WebP quality 0–1. Default 0.85 — visually lossless
 *                   for textile design previews.
 */
export async function compressImage(
  file: File,
  maxWidth = 1920,
  quality = 0.85
): Promise<File> {
  // Skip non-compressible MIME types entirely — PSDs, PDFs, videos, AI.
  if (!COMPRESSIBLE_TYPES.has(file.type)) return file;

  // Skip files already under the threshold — Canvas roundtrip can actually
  // make them slightly larger.
  if (file.size < MIN_BYTES_TO_COMPRESS) return file;

  try {
    const compressed = await runCompressionPipeline(file, maxWidth, quality);
    const beforeKb = Math.round(file.size / 1024);
    const afterKb = Math.round(compressed.size / 1024);
    // If the compressed copy is somehow bigger, keep the original.
    if (compressed.size >= file.size) {
      console.log(
        `[compressImage] ${file.name}: ${beforeKb}KB unchanged (would have grown to ${afterKb}KB)`
      );
      return file;
    }
    console.log(`[compressImage] ${file.name}: ${beforeKb}KB → ${afterKb}KB`);
    return new File([compressed], file.name, {
      type: compressed.type || file.type,
      lastModified: Date.now(),
    });
  } catch (err) {
    // CORS, out-of-memory, decode failure, etc. — let the upload proceed
    // with the original so the user isn't blocked.
    console.warn(
      `[compressImage] ${file.name} compression failed, using original`,
      err
    );
    return file;
  }
}

// ============================================================================
// Internal — canvas pipeline
// ============================================================================

function runCompressionPipeline(
  file: File,
  maxWidth: number,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const { width, height } = scaleDimensions(
          img.naturalWidth,
          img.naturalHeight,
          maxWidth
        );

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // PNGs with transparency can't safely roundtrip to JPEG.
        // For PNGs we re-emit as PNG (quality arg ignored by spec, but smaller
        // dimensions still help). Everything else goes to JPEG for best ratio.
        const outType = file.type === "image/png" ? "image/png" : "image/jpeg";

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error("Canvas toBlob returned null"));
              return;
            }
            resolve(blob);
          },
          outType,
          quality
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };

    img.src = url;
  });
}

/**
 * Scale so that the longest edge equals `maxWidth`, preserving aspect ratio.
 * If the image is already smaller, return its original dimensions unchanged.
 */
function scaleDimensions(
  srcW: number,
  srcH: number,
  maxWidth: number
): { width: number; height: number } {
  const longest = Math.max(srcW, srcH);
  if (longest <= maxWidth) return { width: srcW, height: srcH };
  const ratio = maxWidth / longest;
  return {
    width: Math.round(srcW * ratio),
    height: Math.round(srcH * ratio),
  };
}
