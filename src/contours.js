import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { cCOLOURS, debugShow } from "./debug.js";

export class ContourInfo {
  constructor(contour, moments, rect, mask) {
    this.contour = contour; // cv.Mat (vector of points)
    this.rect = rect; // {x, y, width, height}
    this.mask = mask; // cv.Mat
    this.center = moments.center; // [x, y]
    this.tangent = moments.tangent; // [vx, vy]

    // Angle = atan2(dy, dx)
    this.angle = Math.atan2(this.tangent[1], this.tangent[0]);

    // Project points
    const pts = this.getPoints();
    const clx = pts.map((p) => this.projX(p));
    const lxmin = Math.min(...clx);
    const lxmax = Math.max(...clx);

    this.local_xrng = [lxmin, lxmax];

    // point0 = center + tangent * lxmin
    this.point0 = [
      this.center[0] + this.tangent[0] * lxmin,
      this.center[1] + this.tangent[1] * lxmin,
    ];

    // point1 = center + tangent * lxmax
    this.point1 = [
      this.center[0] + this.tangent[0] * lxmax,
      this.center[1] + this.tangent[1] * lxmax,
    ];

    this.pred = null;
    this.succ = null;
  }

  getPoints() {
    // Extract points from contour Mat
    const cv = getOpenCV();
    const points = [];
    // contour is CV_32SC2
    for (let i = 0; i < this.contour.rows; i++) {
      const x = this.contour.intPtr(i, 0)[0];
      const y = this.contour.intPtr(i, 0)[1];
      points.push([x, y]);
    }
    return points;
  }

  projX(point) {
    // dot(tangent, point - center)
    const dx = point[0] - this.center[0];
    const dy = point[1] - this.center[1];
    return this.tangent[0] * dx + this.tangent[1] * dy;
  }

  localOverlap(other) {
    const xmin = this.projX(other.point0);
    const xmax = this.projX(other.point1);
    return intervalMeasureOverlap(this.local_xrng, [xmin, xmax]);
  }

  destroy() {
    if (this.contour && !this.contour.isDeleted()) {
      this.contour.delete();
    }
    if (this.mask && !this.mask.isDeleted()) {
      this.mask.delete();
    }
  }
}

function intervalMeasureOverlap(int_a, int_b) {
  // min(a_end, b_end) - max(a_start, b_start)
  return Math.min(int_a[1], int_b[1]) - Math.max(int_a[0], int_b[0]);
}

export function blobMeanAndTangent(contour) {
  const cv = getOpenCV();
  const moments = cv.moments(contour);
  const area = moments.m00;

  if (area === 0) return null;

  const mean_x = moments.m10 / area;
  const mean_y = moments.m01 / area;

  // Covariance matrix
  // [mu20, mu11; mu11, mu02] / area
  const mu20 = moments.mu20 / area;
  const mu11 = moments.mu11 / area;
  const mu02 = moments.mu02 / area;

  // 2x2 Eigen decomposition
  // Trace T = a + d, Det D = ad - bc
  // L = T/2 +/- sqrt(T^2/4 - D)
  const T = mu20 + mu02;
  const D = mu20 * mu02 - mu11 * mu11;

  const L1 = T / 2 + Math.sqrt(Math.max(0, (T * T) / 4 - D));
  // const L2 = T / 2 - Math.sqrt(Math.max(0, T * T / 4 - D));

  // Eigenvector for L1 (dominant axis)
  // (A - L1*I)v = 0 => (mu20 - L1)x + mu11*y = 0
  // if mu11 != 0, y = -(mu20 - L1)x / mu11
  // Or use ATAN2 for stability.

  let tx, ty;
  if (Math.abs(mu11) > 1e-9) {
    const diff = mu20 - L1;
    // (diff)x + (mu11)y = 0  =>  y/x = -diff/mu11
    const theta = Math.atan2(-diff, mu11);
    tx = Math.cos(theta);
    ty = Math.sin(theta);
  } else {
    // Diagonal matrix. Eigenvectors are (1,0) and (0,1).
    // L1 = max(mu20, mu02).
    if (mu20 >= mu02) {
      tx = 1;
      ty = 0;
    } else {
      tx = 0;
      ty = 1;
    }
  }

  return {
    center: [mean_x, mean_y],
    tangent: [tx, ty],
  };
}

export function makeTightMask(contour, xmin, ymin, width, height) {
  const cv = getOpenCV();
  const mask = new cv.Mat.zeros(height, width, cv.CV_8UC1);

  // Shift contour
  const shiftedContour = new cv.Mat();
  // We can't easily shift points in place without iteration in JS OpenCV bindings (no broadcasting)
  // Or we use a transformation matrix? No, just iterating is easier for now or drawContours with offset?
  // drawContours supports 'offset' parameter!

  const contoursVec = new cv.MatVector();
  contoursVec.push_back(contour);

  const offset = new cv.Point(-xmin, -ymin);
  const color = new cv.Scalar(1);

  cv.drawContours(
    mask,
    contoursVec,
    0,
    color,
    -1,
    cv.LINE_8,
    new cv.Mat(),
    2147483647,
    offset
  );

  contoursVec.delete();
  // shiftedContour not strictly needed if we use offset
  shiftedContour.delete();

  return mask;
}

export function getContours(name, small, mask) {
  const cv = getOpenCV();
  const contoursVec = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.findContours(
    mask,
    contoursVec,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_NONE
  );

  const contoursOut = [];

  for (let i = 0; i < contoursVec.size(); i++) {
    const contour = contoursVec.get(i);
    const rect = cv.boundingRect(contour); // {x, y, width, height}

    const { width, height, x: xmin, y: ymin } = rect;

    if (
      width < Config.TEXT_MIN_WIDTH ||
      height < Config.TEXT_MIN_HEIGHT ||
      width < Config.TEXT_MIN_ASPECT * height
    ) {
      contour.delete();
      continue;
    }

    const tightMask = makeTightMask(contour, xmin, ymin, width, height);

    // check max thickness (max value of column sums)
    // reduce to row vector by summing columns
    const colSums = new cv.Mat();
    cv.reduce(tightMask, colSums, 0, cv.REDUCE_SUM, cv.CV_32S);
    let maxThickness = 0;
    // iterate colSums
    const colSumsData = colSums.data32S;
    for (let j = 0; j < colSumsData.length; j++) {
      if (colSumsData[j] > maxThickness) maxThickness = colSumsData[j];
    }
    colSums.delete();

    if (maxThickness > Config.TEXT_MAX_THICKNESS) {
      tightMask.delete();
      contour.delete();
      continue;
    }

    const moments = blobMeanAndTangent(contour);
    if (!moments) {
      tightMask.delete();
      contour.delete();
      continue;
    }

    // NOTE: We are keeping 'contour' Mat alive inside ContourInfo.
    // We need to verify if 'contoursVec.get(i)' returns a copy or reference.
    // It returns a new Mat header sharing data? Or a copy?
    // Usually in opencv.js it's a new Mat. We must manually delete it later when destroying ContourInfo.
    // For now, we let the GC handle ContourInfo, but the Mat inside needs explicit deletion?
    // opencv-wasm requires explicit delete().
    // So we should probably clone the contour to own it, or ensure we manage lifecycle.
    // contoursVec.get(i) gives us a Mat. If we push to contoursOut, we keep it.
    // If we continue, we must delete it.

    contoursOut.push(
      new ContourInfo(contour.clone(), moments, rect, tightMask)
    );
    contour.delete();
  }

  hierarchy.delete();
  contoursVec.delete();

  if (Config.DEBUG_LEVEL >= 2) {
    visualizeContours(name, small, contoursOut);
  }

  return contoursOut;
}

export async function visualizeContours(name, small, cinfoList) {
  const cv = getOpenCV();
  const display = small.clone();
  // Drawing logic...
  // To keep it simple for this step, skipping complex blending logic.
  // Just draw contours.

  const contoursVec = new cv.MatVector();
  for (const cinfo of cinfoList) {
    contoursVec.push_back(cinfo.contour);
  }

  for (let i = 0; i < cinfoList.length; i++) {
    const colorArr = cCOLOURS[i % cCOLOURS.length];
    const color = new cv.Scalar(colorArr[0], colorArr[1], colorArr[2], 255);
    cv.drawContours(display, contoursVec, i, color, -1);

    // Draw lines
    const cinfo = cinfoList[i];
    const p0 = new cv.Point(cinfo.point0[0], cinfo.point0[1]);
    const p1 = new cv.Point(cinfo.point1[0], cinfo.point1[1]);
    cv.line(display, p0, p1, new cv.Scalar(255, 255, 255, 255), 1);
  }

  contoursVec.delete();

  await debugShow(name, 1, "contours", display);
  display.delete();
}
