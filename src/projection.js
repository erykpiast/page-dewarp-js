import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";

/**
 * Returns the 3x3 camera intrinsic matrix.
 * @returns {cv.Mat}
 */
export function getK() {
  const cv = getOpenCV();
  const f_val = Config.FOCAL_LENGTH;
  const data = [f_val, 0, 0, 0, f_val, 0, 0, 0, 1];
  return cv.matFromArray(3, 3, cv.CV_64F, data);
}

/**
 * Projects 2D page coordinates to 2D image coordinates using the cubic surface
 * model and camera pose.
 * @param {Array<[number, number]>} xyCoords
 * @param {Array<number>} pvec
 * @returns {Array<[number, number]>}
 */
export function projectXY(xyCoords, pvec) {
  const cv = getOpenCV();

  // xyCoords is array of [x, y]
  // pvec is array of numbers

  const rvecIdx = Config.RVEC_IDX;
  const tvecIdx = Config.TVEC_IDX;
  const cubicIdx = Config.CUBIC_IDX;

  let a = pvec[cubicIdx[0]];
  let b = pvec[cubicIdx[0] + 1];

  a = Math.max(-0.5, Math.min(0.5, a));
  b = Math.max(-0.5, Math.min(0.5, b));

  // Polynomial coefficients for cubic surface: z = p0*x^3 + p1*x^2 + p2*x
  const p0 = a + b;
  const p1 = -2 * a - b;
  const p2 = a;

  const objPoints = [];
  for (const pt of xyCoords) {
    const x = pt[0];
    const y = pt[1];
    const x2 = x * x;
    const x3 = x2 * x;
    const z = p0 * x3 + p1 * x2 + p2 * x;
    objPoints.push([x, y, z]);
  }

  const rvecData = pvec.slice(rvecIdx[0], rvecIdx[1]);
  const tvecData = pvec.slice(tvecIdx[0], tvecIdx[1]);

  const rvecMat = cv.matFromArray(3, 1, cv.CV_64F, rvecData);
  const R = new cv.Mat();
  cv.Rodrigues(rvecMat, R);

  const t = tvecData;

  const K_f = Config.FOCAL_LENGTH;

  const result = [];

  // R is 3x3 CV_64F
  // Accessing elements
  const r00 = R.doubleAt(0, 0),
    r01 = R.doubleAt(0, 1),
    r02 = R.doubleAt(0, 2);
  const r10 = R.doubleAt(1, 0),
    r11 = R.doubleAt(1, 1),
    r12 = R.doubleAt(1, 2);
  const r20 = R.doubleAt(2, 0),
    r21 = R.doubleAt(2, 1),
    r22 = R.doubleAt(2, 2);

  const tx = t[0],
    ty = t[1],
    tz = t[2];

  for (const p of objPoints) {
    const X = p[0],
      Y = p[1],
      Z = p[2];

    // P_cam = R * P + t
    const Pcx = r00 * X + r01 * Y + r02 * Z + tx;
    const Pcy = r10 * X + r11 * Y + r12 * Z + ty;
    const Pcz = r20 * X + r21 * Y + r22 * Z + tz;

    // Project
    const x_p = Pcx / Pcz;
    const y_p = Pcy / Pcz;

    // Apply K
    // u = fx * x_p + cx (cx=0)
    const u = K_f * x_p;
    const v = K_f * y_p;

    result.push([u, v]);
  }

  rvecMat.delete();
  R.delete();

  return result;
}
