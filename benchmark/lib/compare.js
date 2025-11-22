import pixelmatch from "pixelmatch";
import sharp from "sharp";
import { ssim } from "ssim.js";

/**
 * Compares two images and returns SSIM and pixel difference metrics.
 * @param {string} actualPath - Path to the generated image.
 * @param {string} expectedPath - Path to the ground truth image.
 * @returns {Promise<{ssim: number, diffPixels: number, diffPercentage: number, width: number, height: number}>}
 */
export async function compareImages(actualPath, expectedPath) {
  // Load expected image first to get dimensions
  const expectedImage = sharp(expectedPath);
  const expectedMeta = await expectedImage.metadata();
  const { width, height } = expectedMeta;

  // Process expected image to raw buffer (grayscale for fairness in thresholded images)
  // forcing 4 channels (RGBA) is often easier for pixelmatch/ssim compatibility
  // unless we specifically use single channel modes.
  // pixelmatch expects RGBA. ssim.js can handle others but RGBA is safe.
  const expectedBuffer = await expectedImage
    .ensureAlpha()
    .resize(width, height) // ensure explicit size
    .raw()
    .toBuffer();

  // Process actual image, resizing to match expected dimensions if necessary
  const actualImage = sharp(actualPath);
  const actualBuffer = await actualImage
    .ensureAlpha()
    .resize(width, height)
    .raw()
    .toBuffer();

  // Pixelmatch
  // Returns number of mismatched pixels
  const diffPixels = pixelmatch(
    actualBuffer,
    expectedBuffer,
    null, // we don't need a diff image output for now
    width,
    height,
    { threshold: 0.1 } // sensitivity
  );

  const totalPixels = width * height;
  const diffPercentage = diffPixels / totalPixels;

  // SSIM
  // ssim.js expects { data, width, height, channels }
  // sharp raw output with ensureAlpha is RGBA (4 channels)
  const ssimResult = ssim(
    { data: actualBuffer, width, height, channels: 4 },
    { data: expectedBuffer, width, height, channels: 4 }
  );

  return {
    ssim: ssimResult.mssim,
    diffPixels,
    diffPercentage,
    width,
    height,
  };
}
