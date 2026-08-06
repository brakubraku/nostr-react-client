import * as nsfwjs from "nsfwjs";

/**
 * NSFW image checking built on nsfwjs.
 *
 * The MobileNetV2 model (~3.5MB, bundled with nsfwjs) is loaded lazily on the
 * first use and reused for every subsequent check.
 */

export const NSFW_CLASSES = ["Porn", "Hentai", "Sexy"];
export const NSFW_THRESHOLD = 0.5;

let modelPromise = null;

function getModel() {
  if (!modelPromise) {
    modelPromise = nsfwjs.load().catch((error) => {
      modelPromise = null; // allow a retry on the next image
      throw error;
    });
  }
  return modelPromise;
}

/**
 * Run nsfwjs classification on an <img>, <video>, <canvas>, or tensor.
 * Returns the predictions array, or null when the model/image cannot be used
 * (for example an image host without CORS headers, or running in jsdom).
 */
export async function classifyImage(image) {
  try {
    const model = await getModel();
    return await model.classify(image);
  } catch (error) {
    console.warn("NSFWJS classification failed:", error);
    return null;
  }
}

/**
 * Decide whether a set of nsfwjs predictions should be treated as NSFW.
 * The probabilities of the Porn, Hentai, and Sexy classes are summed and
 * compared against the threshold.
 */
export function isNsfw(predictions, threshold = NSFW_THRESHOLD) {
  if (!Array.isArray(predictions)) return false;
  const nsfwScore = predictions.reduce(
    (total, p) =>
      NSFW_CLASSES.includes(p?.className)
        ? total + (p?.probability || 0)
        : total,
    0,
  );
  return nsfwScore >= threshold;
}

const resultCache = new Map();

/**
 * Check a single image URL and return whether it is NSFW.
 *
 * The image is fetched with `crossOrigin: "anonymous"` because nsfwjs needs
 * to read the pixels into a canvas. Hosts that do not send CORS headers
 * cannot be checked, and such images are treated as safe (shown as-is).
 * Results are cached per URL so repeated cards don't re-run the model.
 */
export async function checkImageUrl(url) {
  if (resultCache.has(url)) return resultCache.get(url);

  const result = { nsfw: true, cf: null, error: null };
  try {
    const probe = await loadImage(url);
    result.cf = await classifyImage(probe);
    console.log("classified:", result.cf);
    result.nsfw = isNsfw(result.cf);
  } catch (error) {
    console.warn(`NSFW check failed for ${url}:`, error);
    result.error = error;
  }
  resultCache.set(url, result);
  return result;
}

/**
 * Load an image as a CORS-enabled probe. nsfwjs needs to read the pixels
 * into a canvas, so hosts that do not send CORS headers fail here and the
 * URL is treated as safe (shown as-is).
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => resolve(probe);
    probe.onerror = () => reject(new Error(`image failed to load: ${url}`));
    probe.src = url;
  });
}
