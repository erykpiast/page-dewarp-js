import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";

export function getK() {
  const cv = getOpenCV();
  const f_val = Config.FOCAL_LENGTH;
  const data = [f_val, 0, 0, 0, f_val, 0, 0, 0, 1];
  return cv.matFromArray(3, 3, cv.CV_64F, data);
}

export function projectXY(xyCoords, pvec) {
  const cv = getOpenCV();

  // xyCoords is array of [x, y]
  // pvec is array of numbers

  const alpha = pvec[Config.CUBIC_IDX[0]];
  const beta = pvec[Config.CUBIC_IDX[1] + 1]; // Config.CUBIC_IDX is [6, 8], so alpha=pvec[6], beta=pvec[7]
  // Wait, python slice is [start:end], so [6:8] gives indices 6, 7.
  // JS slice is same.
  // But pvec access: pvec[6], pvec[7].

  const rvecIdx = Config.RVEC_IDX; // [0, 3] -> 0, 1, 2
  const tvecIdx = Config.TVEC_IDX; // [3, 6] -> 3, 4, 5
  const cubicIdx = Config.CUBIC_IDX; // [6, 8] -> 6, 7

  let a = pvec[cubicIdx[0]];
  let b = pvec[cubicIdx[0] + 1];

  // Clip
  a = Math.max(-0.5, Math.min(0.5, a));
  b = Math.max(-0.5, Math.min(0.5, b));

  // poly = [a+b, -2a-b, a, 0]
  // z = poly[0]*x^3 + poly[1]*x^2 + poly[2]*x + poly[3]

  const p0 = a + b;
  const p1 = -2 * a - b;
  const p2 = a;
  // const p3 = 0;

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

  // Convert rvec to R
  const rvecMat = cv.matFromArray(3, 1, cv.CV_64F, rvecData);
  const R = new cv.Mat();
  cv.Rodrigues(rvecMat, R); // R is 3x3

  const t = tvecData; // array

  // K matrix
  // K = [[f, 0, 0], [0, f, 0], [0, 0, 1]]
  const f_val = Config.FOCAL_LENGTH;
  // projectPoints in Python uses K(cfg) which returns pixels if focal length was scaled.
  // Here getK() returns K with f_val (1.2 usually).
  // So we are projecting to normalized coordinates?
  // Python: projectPoints -> image_points (pixels).
  // Wait, in Python `options/k_opt.py`:
  // return np.array([[FOCAL_LENGTH*width, ...]])
  // So Python projects to PIXELS.
  // My `getK` uses `Config.FOCAL_LENGTH * max_dim`?
  // Yes: `const f = Config.FOCAL_LENGTH * Math.max(Config.SCREEN_MAX_W, Config.SCREEN_MAX_H);`
  // Wait, Config.SCREEN_MAX_W is screen size. `getK` should use IMAGE size?
  // In Python, `K(cfg)` seems to use global config width?
  // `from .core import Config`
  // In `options.py`, `cfg` is global.
  // But `K` function takes `cfg`.
  // Does `cfg` store the image dimensions? No.
  // Wait, `projection.py`: `K(cfg=cfg)`.
  // `k_opt.py`: `def K(cfg): return np.array([[cfg.FOCAL_LENGTH, ...]])`?
  // Earlier `read_file` of `k_opt.py` showed:
  /*
    25|    return np.array(
    26|        [
    27|            [cfg.FOCAL_LENGTH, 0, 0],
    28|            [0, cfg.FOCAL_LENGTH, 0],
    29|            [0, 0, 1],
    30|        ],
    31|        dtype=np.float32,
    32|    )
  */
  // IT DOES NOT USE WIDTH/HEIGHT!
  // So `projectPoints` returns NORMALIZED coordinates (since `FOCAL_LENGTH` is ~1.2).
  // Unless `FOCAL_LENGTH` is huge. Default 1.2.
  // So `project_xy` returns NORMALIZED coords.
  // Then `dewarp.py` line 100: `image_points = norm2pix(img.shape, image_points, False)`
  // converts normalized to pixels.
  // THIS MATCHES MY HYPOTHESIS.

  // So `getK` in JS should return K with f=1.2.
  // Let's fix `getK`.

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
