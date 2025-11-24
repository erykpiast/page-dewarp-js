import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { projectXY } from "./projection.js";
import { norm2pix, roundNearestMultiple, saveMat } from "./utils.js";

function linspace(start, end, num) {
  const step = (end - start) / (num - 1);
  const arr = [];
  for (let i = 0; i < num; i++) arr.push(start + i * step);
  return arr;
}

function computeOutputDimensions(pageDims, imgRows) {
  const [pageWidthNorm, pageHeightNorm] = pageDims;

  let height = 0.5 * pageHeightNorm * Config.OUTPUT_ZOOM * imgRows;
  height = roundNearestMultiple(height, Config.REMAP_DECIMATE);

  let width = roundNearestMultiple(
    (height * pageWidthNorm) / pageHeightNorm,
    Config.REMAP_DECIMATE
  );

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

  return { width, height, widthSmall, heightSmall };
}

function buildRemapMaps(widthSmall, heightSmall, pageDims, params, img) {
  const cv = getOpenCV();
  const [pageWidthNorm, pageHeightNorm] = pageDims;

  const pageXRange = linspace(0, pageWidthNorm, widthSmall);
  const pageYRange = linspace(0, pageHeightNorm, heightSmall);

  const pageXYCoords = [];
  for (const y of pageYRange) {
    for (const x of pageXRange) {
      pageXYCoords.push([x, y]);
    }
  }

  const projPoints = projectXY(pageXYCoords, params);
  const imagePoints = norm2pix(img, projPoints, false);

  const mapXSmall = new cv.Mat(heightSmall, widthSmall, cv.CV_32F);
  const mapYSmall = new cv.Mat(heightSmall, widthSmall, cv.CV_32F);

  let invalidPointCount = 0;
  for (let i = 0; i < imagePoints.length; i++) {
    const row = Math.floor(i / widthSmall);
    const col = i % widthSmall;

    if (row < heightSmall && col < widthSmall) {
      let x = imagePoints[i][0];
      let y = imagePoints[i][1];

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        invalidPointCount++;
        x = 0;
        y = 0;
      }

      const MAX_COORD = 100000;
      if (x > MAX_COORD) x = MAX_COORD;
      if (x < -MAX_COORD) x = -MAX_COORD;
      if (y > MAX_COORD) y = MAX_COORD;
      if (y < -MAX_COORD) y = -MAX_COORD;

      mapXSmall.floatPtr(row, col)[0] = x;
      mapYSmall.floatPtr(row, col)[0] = y;
    }
  }

  if (invalidPointCount > 0) {
    console.warn(
      `  WARNING: Found ${invalidPointCount} NaN/Inf points in projection. Replaced with 0.`
    );
  }

  const mapX = new cv.Mat();
  const mapY = new cv.Mat();
  const dsize = new cv.Size(
    widthSmall * Config.REMAP_DECIMATE,
    heightSmall * Config.REMAP_DECIMATE
  );
  cv.resize(mapXSmall, mapX, dsize, 0, 0, cv.INTER_CUBIC);
  cv.resize(mapYSmall, mapY, dsize, 0, 0, cv.INTER_CUBIC);

  return { mapX, mapY, mapXSmall, mapYSmall };
}

function applyRemapAndThreshold(img, mapX, mapY, width, height) {
  const cv = getOpenCV();

  const imgGray = new cv.Mat();
  cv.cvtColor(img, imgGray, cv.COLOR_RGB2GRAY);

  const remapped = new cv.Mat();
  cv.remap(imgGray, remapped, mapX, mapY, cv.INTER_CUBIC, cv.BORDER_REPLICATE);

  imgGray.delete();

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

  return result;
}

/**
 * Generates the final dewarped output by mapping target pixels back through the
 * optimized 3D model.
 */
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
    const { width, height, widthSmall, heightSmall } = computeOutputDimensions(
      this.pageDims,
      this.img.rows
    );

    const { mapX, mapY, mapXSmall, mapYSmall } = buildRemapMaps(
      widthSmall,
      heightSmall,
      this.pageDims,
      this.params,
      this.img
    );

    const result = applyRemapAndThreshold(this.img, mapX, mapY, width, height);

    this.threshfile = `${this.name}_thresh.png`;
    await saveMat(result, this.threshfile);

    if (Config.DEBUG_LEVEL >= 1) {
      // Show output
    }

    mapXSmall.delete();
    mapYSmall.delete();
    mapX.delete();
    mapY.delete();
    result.delete();
  }
}
