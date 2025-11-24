import { Config } from "./config.js";
import { getContours } from "./contours.js";
import { getOpenCV } from "./cv-loader.js";
import { DebugMetrics } from "./debug-metrics.js";
import { debugShow } from "./debug.js";

export function box(width, height) {
  const cv = getOpenCV();
  // struct element of ones
  // cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(width, height));
  return cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(width, height));
}

function collectMaskStats(mask, includeAllRects = false) {
  const cv = getOpenCV();
  const stats = {
    nonzero: cv.countNonZero(mask),
    contourCount: 0,
    sampleRects: [],
  };

  const working = mask.clone();
  const contoursVec = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(
    working,
    contoursVec,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );
  working.delete();

  stats.contourCount = contoursVec.size();
  const rects = [];
  for (let i = 0; i < contoursVec.size(); i++) {
    const contour = contoursVec.get(i);
    const rect = cv.boundingRect(contour);
    rects.push({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      area: rect.width * rect.height,
    });
    contour.delete();
  }
  rects
    .sort((a, b) => b.area - a.area)
    .slice(0, 5)
    .forEach((rect) => {
      stats.sampleRects.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    });
  if (includeAllRects) {
    stats.allRects = rects
      .map(({ area, ...rest }) => rest)
      .sort(
        (a, b) =>
          a.y - b.y || a.x - b.x || a.width - b.width || a.height - b.height
      );
  }
  contoursVec.delete();
  hierarchy.delete();

  return stats;
}

export class Mask {
  constructor(name, small, pagemask, text = true) {
    this.name = name;
    this.small = small;
    this.pagemask = pagemask;
    this.text = text;
    this.value = null;

    this.calculate();
  }

  calculate() {
    const cv = getOpenCV();
    const stageStats = [];
    const recordStage = (stage, mat, op) => {
      const stats = collectMaskStats(mat, stage === "final");
      stageStats.push({
        name: this.name,
        mode: this.text ? "text" : "lines",
        stage,
        op,
        ...stats,
      });
    };
    const sgray = new cv.Mat();
    cv.cvtColor(this.small, sgray, cv.COLOR_RGB2GRAY);

    let mask = new cv.Mat();
    cv.adaptiveThreshold(
      sgray,
      mask,
      255,
      cv.ADAPTIVE_THRESH_MEAN_C,
      cv.THRESH_BINARY_INV,
      Config.ADAPTIVE_WINSZ,
      this.text ? 25 : 7
    );

    this.log(0.1, "thresholded", mask);
    recordStage("threshold", mask, "adaptiveThreshold");

    // Morph ops
    if (this.text) {
      const kernel = box(9, 1);
      const dilated = new cv.Mat();
      cv.dilate(mask, dilated, kernel);
      kernel.delete();
      mask.delete();
      mask = dilated;
      this.log(0.2, "dilated", mask);
      recordStage("morph1", mask, "dilate(9x1)");

      const kernel2 = box(1, 3);
      const eroded = new cv.Mat();
      cv.erode(mask, eroded, kernel2);
      kernel2.delete();
      mask.delete();
      mask = eroded;
      this.log(0.3, "eroded", mask);
      recordStage("morph2", mask, "erode(1x3)");
    } else {
      const kernel = box(3, 1);
      const eroded = new cv.Mat();
      cv.erode(mask, eroded, kernel, new cv.Point(-1, -1), 3);
      kernel.delete();
      mask.delete();
      mask = eroded;
      this.log(0.2, "eroded", mask);
      recordStage("morph1", mask, "erode(3x1)x3");

      const kernel2 = box(8, 2);
      const dilated = new cv.Mat();
      cv.dilate(mask, dilated, kernel2);
      kernel2.delete();
      mask.delete();
      mask = dilated;
      this.log(0.3, "dilated", mask);
      recordStage("morph2", mask, "dilate(8x2)");
    }

    const finalMask = new cv.Mat();
    cv.bitwise_and(mask, this.pagemask, finalMask);
    recordStage("final", finalMask, "bitwise_and_pagemask");

    mask.delete();
    sgray.delete();

    this.value = finalMask;
    DebugMetrics.add(
      this.text ? "mask_stats_text" : "mask_stats_lines",
      stageStats
    );
  }

  async log(step, text, display) {
    if (Config.DEBUG_LEVEL >= 3) {
      let s = step;
      if (!this.text) s += 0.3;
      await debugShow(this.name, s, text, display);
    }
  }

  contours() {
    return getContours(this.name, this.small, this.value);
  }

  destroy() {
    if (this.value && !this.value.isDeleted()) {
      this.value.delete();
    }
  }
}
