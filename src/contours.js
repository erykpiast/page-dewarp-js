import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { cCOLOURS, debugShow } from "./debug.js";

/**
 * Represents a single detected text blob with geometric properties.
 */
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
    const projectedXCoords = pts.map((p) => this.projX(p));
    const localXMin = Math.min(...projectedXCoords);
    const localXMax = Math.max(...projectedXCoords);

    this.local_xrng = [localXMin, localXMax];

    // point0 = center + tangent * localXMin
    this.point0 = [
      this.center[0] + this.tangent[0] * localXMin,
      this.center[1] + this.tangent[1] * localXMin,
    ];

    // point1 = center + tangent * localXMax
    this.point1 = [
      this.center[0] + this.tangent[0] * localXMax,
      this.center[1] + this.tangent[1] * localXMax,
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

/**
 * Calculates center of mass and principal axis orientation using image moments.
 * @param {cv.Mat} contour
 * @returns {{ center: [number, number], tangent: [number, number] } | null}
 */
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

  let tangentX, tangentY;
  if (Math.abs(mu11) > 1e-9) {
    const diff = mu20 - L1;
    // (diff)x + (mu11)y = 0  =>  y/x = -diff/mu11
    const theta = Math.atan2(-diff, mu11);
    tangentX = Math.cos(theta);
    tangentY = Math.sin(theta);
  } else {
    // Diagonal matrix. Eigenvectors are (1,0) and (0,1).
    // L1 = max(mu20, mu02).
    if (mu20 >= mu02) {
      tangentX = 1;
      tangentY = 0;
    } else {
      tangentX = 0;
      tangentY = 1;
    }
  }

  return {
    center: [mean_x, mean_y],
    tangent: [tangentX, tangentY],
  };
}

/**
 * Creates a cropped binary mask for a contour.
 * @param {cv.Mat} contour
 * @param {number} xmin
 * @param {number} ymin
 * @param {number} width
 * @param {number} height
 * @returns {cv.Mat}
 */
export function makeTightMask(contour, xmin, ymin, width, height) {
  const cv = getOpenCV();
  const mask = new cv.Mat.zeros(height, width, cv.CV_8UC1);

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

  return mask;
}

let lastContourStats = null;
export function getLastContourStats() {
  return lastContourStats;
}

function findRawContours(mask) {
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

  hierarchy.delete();
  return contoursVec;
}

function filterContourByGeometry(contour, rect, stats) {
  const { width, height } = rect;

  if (width < Config.TEXT_MIN_WIDTH) {
    stats.rejectionBreakdown.width++;
    if (stats.sampleRejectedRects.length < 20) {
      stats.sampleRejectedRects.push({ reason: "width", rect });
    }
    return { valid: false, reason: "width" };
  }

  if (height < Config.TEXT_MIN_HEIGHT) {
    stats.rejectionBreakdown.height++;
    if (stats.sampleRejectedRects.length < 20) {
      stats.sampleRejectedRects.push({ reason: "height", rect });
    }
    return { valid: false, reason: "height" };
  }

  if (width < Config.TEXT_MIN_ASPECT * height) {
    stats.rejectionBreakdown.aspect++;
    if (stats.sampleRejectedRects.length < 20) {
      stats.sampleRejectedRects.push({ reason: "aspect", rect });
    }
    return { valid: false, reason: "aspect" };
  }

  return { valid: true };
}

function filterContourByThickness(tightMask, rect, stats) {
  const cv = getOpenCV();
  const colSums = new cv.Mat();
  cv.reduce(tightMask, colSums, 0, cv.REDUCE_SUM, cv.CV_32S);

  let maxThickness = 0;
  const colSumsData = colSums.data32S;
  for (let j = 0; j < colSumsData.length; j++) {
    if (colSumsData[j] > maxThickness) maxThickness = colSumsData[j];
  }
  colSums.delete();

  if (maxThickness > Config.TEXT_MAX_THICKNESS) {
    stats.rejectionBreakdown.thickness++;
    if (stats.sampleRejectedRects.length < 20) {
      stats.sampleRejectedRects.push({ reason: "thickness", rect });
    }
    return { valid: false, reason: "thickness" };
  }

  return { valid: true };
}

/**
 * Finds and filters text contours from a binary mask.
 * @param {string} name
 * @param {cv.Mat} small
 * @param {cv.Mat} mask
 * @returns {Array<ContourInfo>}
 */
export function getContours(name, small, mask) {
  const cv = getOpenCV();
  const contoursVec = findRawContours(mask);

  const contoursOut = [];
  const stats = {
    totalContours: contoursVec.size(),
    acceptedContours: 0,
    rejectionBreakdown: {
      width: 0,
      height: 0,
      aspect: 0,
      thickness: 0,
      zeroMoments: 0,
    },
    sampleRejectedRects: [],
  };

  for (let i = 0; i < contoursVec.size(); i++) {
    const contour = contoursVec.get(i);
    const rect = cv.boundingRect(contour);
    const { width, height, x: xmin, y: ymin } = rect;

    const geometryResult = filterContourByGeometry(contour, rect, stats);
    if (!geometryResult.valid) {
      contour.delete();
      continue;
    }

    const tightMask = makeTightMask(contour, xmin, ymin, width, height);

    const thicknessResult = filterContourByThickness(tightMask, rect, stats);
    if (!thicknessResult.valid) {
      tightMask.delete();
      contour.delete();
      continue;
    }

    const moments = blobMeanAndTangent(contour);
    if (!moments) {
      stats.rejectionBreakdown.zeroMoments++;
      if (stats.sampleRejectedRects.length < 20) {
        stats.sampleRejectedRects.push({ reason: "moments", rect });
      }
      tightMask.delete();
      contour.delete();
      continue;
    }

    contoursOut.push(
      new ContourInfo(contour.clone(), moments, rect, tightMask)
    );
    stats.acceptedContours++;
    contour.delete();
  }

  contoursVec.delete();
  lastContourStats = stats;

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
