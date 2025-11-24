import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { projectXY } from "./projection.js";
import { norm2pix, roundNearestMultiple, saveMat } from "./utils.js";

export class RemappedImage {
  constructor(name, img, small, pageDims, params) {
    this.name = name;
    this.img = img; // Full res image (RGB)
    this.small = small;
    this.pageDims = pageDims; // [width, height]
    this.params = params;
    this.threshfile = null;
  }

  async process() {
    const cv = getOpenCV();

    const [pageWidthNorm, pageHeightNorm] = this.pageDims;

    let height = 0.5 * pageHeightNorm * Config.OUTPUT_ZOOM * this.img.rows;
    height = roundNearestMultiple(height, Config.REMAP_DECIMATE);

    let width = roundNearestMultiple(
      (height * pageWidthNorm) / pageHeightNorm,
      Config.REMAP_DECIMATE
    );

    // Clamp huge dimensions to prevent WASM memory error
    const MAX_DIM = 3000;
    if (width > MAX_DIM || height > MAX_DIM) {
      const scale = MAX_DIM / Math.max(width, height);
      width = roundNearestMultiple(width * scale, Config.REMAP_DECIMATE);
      height = roundNearestMultiple(height * scale, Config.REMAP_DECIMATE);
      console.log(`  clamping output to ${width}x${height}`);
    }

    console.log(`  output will be ${width}x${height}`);

    const heightSmall = Math.floor(height / Config.REMAP_DECIMATE);
    const widthSmall = Math.floor(width / Config.REMAP_DECIMATE);

    // Create meshgrid for small map
    const pageXRange = linspace(0, pageWidthNorm, widthSmall);
    const pageYRange = linspace(0, pageHeightNorm, heightSmall);

    const pageXYCoords = [];
    for (const y of pageYRange) {
      for (const x of pageXRange) {
        pageXYCoords.push([x, y]);
      }
    }

    // Project points
    const projPoints = projectXY(pageXYCoords, this.params); // returns [[x,y], ...] normalized

    // Convert to pixel coords (norm2pix) relative to FULL image
    const imagePoints = norm2pix(this.img, projPoints, false); // asInteger=false for remap (float)

    const mapXSmall = new cv.Mat(heightSmall, widthSmall, cv.CV_32F);
    const mapYSmall = new cv.Mat(heightSmall, widthSmall, cv.CV_32F);

    let badPoints = 0;
    for (let i = 0; i < imagePoints.length; i++) {
      const row = Math.floor(i / widthSmall);
      const col = i % widthSmall;

      if (row < heightSmall && col < widthSmall) {
        let x = imagePoints[i][0];
        let y = imagePoints[i][1];

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          badPoints++;
          x = 0;
          y = 0; // Sanitize
        }

        // Clamp values to prevent integer overflow in cv.remap (WASM)
        // If points are extremely far away, remap implementation might crash
        const MAX_COORD = 100000; // 100k pixels should be enough margin
        if (x > MAX_COORD) x = MAX_COORD;
        if (x < -MAX_COORD) x = -MAX_COORD;
        if (y > MAX_COORD) y = MAX_COORD;
        if (y < -MAX_COORD) y = -MAX_COORD;

        mapXSmall.floatPtr(row, col)[0] = x;
        mapYSmall.floatPtr(row, col)[0] = y;
      }
    }

    if (badPoints > 0) {
      console.warn(
        `  WARNING: Found ${badPoints} NaN/Inf points in projection. Replaced with 0.`
      );
    }

    // Resize
    const mapX = new cv.Mat();
    const mapY = new cv.Mat();
    const dsize = new cv.Size(width, height);
    cv.resize(mapXSmall, mapX, dsize, 0, 0, cv.INTER_CUBIC);
    cv.resize(mapYSmall, mapY, dsize, 0, 0, cv.INTER_CUBIC);

    // Convert img to gray
    const imgGray = new cv.Mat();
    cv.cvtColor(this.img, imgGray, cv.COLOR_RGB2GRAY);

    const remapped = new cv.Mat();
    cv.remap(
      imgGray,
      remapped,
      mapX,
      mapY,
      cv.INTER_CUBIC,
      cv.BORDER_REPLICATE
    );

    let result;

    if (Config.NO_BINARY) {
      result = remapped;
    } else {
      const thresh = new cv.Mat();
      cv.adaptiveThreshold(
        remapped,
        thresh,
        255,
        cv.ADAPTIVE_THRESH_MEAN_C,
        cv.THRESH_BINARY,
        Config.ADAPTIVE_WINSZ,
        25
      );
      result = thresh;
      remapped.delete();
    }

    this.threshfile = `${this.name}_thresh.png`;
    await saveMat(result, this.threshfile);

    if (Config.DEBUG_LEVEL >= 1) {
      // Show output
      // resize to small for display
      // ...
    }

    mapXSmall.delete();
    mapYSmall.delete();
    mapX.delete();
    mapY.delete();
    imgGray.delete();
    if (result !== remapped) result.delete(); // if we created thresh
  }
}

function linspace(start, end, num) {
  const step = (end - start) / (num - 1);
  const arr = [];
  for (let i = 0; i < num; i++) arr.push(start + i * step);
  return arr;
}
