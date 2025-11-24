import { levenbergMarquardt } from "ml-levenberg-marquardt";

/**
 * Refines the pose (rvec, tvec) using Levenberg-Marquardt optimization.
 *
 * @param {Array<number>} rvec - Initial rotation vector [rx, ry, rz]
 * @param {Array<number>} tvec - Initial translation vector [tx, ty, tz]
 * @param {Array<Array<number>>} objectPoints - 3D points
 * @param {Array<Array<number>>} imagePoints - 2D points
 * @param {Array<number>} cameraMatrix - 3x3 array
 * @param {Array<number>} distCoeffs - Distortion coefficients (optional)
 * @returns {{ rvec: Array<number>, tvec: Array<number> }}
 */
export function refinePose(
  rvec,
  tvec,
  objectPoints,
  imagePoints,
  cameraMatrix,
  distCoeffs = []
) {
  // Flatten the problem: 2N observations
  // Input x: index j from 0 to 2N-1
  // Output y: observed coordinate (u or v)

  const numPts = objectPoints.length;
  const xData = [];
  const yData = [];

  for (let i = 0; i < numPts; i++) {
    xData.push(i * 2); // index for u
    xData.push(i * 2 + 1); // index for v
    yData.push(imagePoints[i][0]);
    yData.push(imagePoints[i][1]);
  }

  const initialParams = [...rvec, ...tvec];

  const fx = cameraMatrix[0];
  const cx = cameraMatrix[2];
  const fy = cameraMatrix[4];
  const cy = cameraMatrix[5];

  // Factory function required by ml-levenberg-marquardt
  // (params) => (x) => y
  const modelFactory = (params) => {
    const r = params.slice(0, 3);
    const t = params.slice(3, 6);

    // Precompute Rotation Matrix for this set of params to avoid recomputing per point
    const theta = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
    let R = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    if (theta > 1e-8) {
      const k = [r[0] / theta, r[1] / theta, r[2] / theta];
      const c = Math.cos(theta),
        s = Math.sin(theta),
        C = 1 - c;
      const kx = k[0],
        ky = k[1],
        kz = k[2];
      R = [
        [c + kx * kx * C, kx * ky * C - kz * s, kx * kz * C + ky * s],
        [ky * kx * C + kz * s, c + ky * ky * C, ky * kz * C - kx * s],
        [kz * kx * C - ky * s, kz * ky * C + kx * s, c + kz * kz * C],
      ];
    }

    const tx = t[0],
      ty = t[1],
      tz = t[2];

    // Distortion params
    let k1 = 0,
      k2 = 0,
      p1 = 0,
      p2 = 0,
      k3 = 0;
    let hasDist = false;
    if (distCoeffs && distCoeffs.length >= 4) {
      k1 = distCoeffs[0];
      k2 = distCoeffs[1];
      p1 = distCoeffs[2];
      p2 = distCoeffs[3];
      k3 = distCoeffs[4] || 0;
      hasDist = true;
    }

    // The actual function called for each data point
    return (x) => {
      const idx = Math.floor(x / 2);
      const isV = x % 2 !== 0;

      const p = objectPoints[idx];
      const X = p[0],
        Y = p[1],
        Z = p[2];

      const Xc = R[0][0] * X + R[0][1] * Y + R[0][2] * Z + tx;
      const Yc = R[1][0] * X + R[1][1] * Y + R[1][2] * Z + ty;
      const Zc = R[2][0] * X + R[2][1] * Y + R[2][2] * Z + tz;

      const xProjected = Xc / Zc;
      const yProjected = Yc / Zc;

      let xDistorted = xProjected,
        yDistorted = yProjected;
      if (hasDist) {
        const r2 = xProjected * xProjected + yProjected * yProjected;
        const r4 = r2 * r2;
        const r6 = r4 * r2;
        const rad = 1 + k1 * r2 + k2 * r4 + k3 * r6;
        const dx =
          2 * p1 * xProjected * yProjected +
          p2 * (r2 + 2 * xProjected * xProjected);
        const dy =
          p1 * (r2 + 2 * yProjected * yProjected) +
          2 * p2 * xProjected * yProjected;
        xDistorted = xProjected * rad + dx;
        yDistorted = yProjected * rad + dy;
      }

      if (!isV) {
        return fx * xDistorted + cx;
      } else {
        return fy * yDistorted + cy;
      }
    };
  };

  const options = {
    damping: 1e-2,
    gradientDifference: 1e-3,
    maxIterations: 20,
    errorTolerance: 1e-5,
    initialValues: initialParams,
  };

  const fitted = levenbergMarquardt(
    { x: xData, y: yData },
    modelFactory,
    options
  );

  return {
    rvec: fitted.parameterValues.slice(0, 3),
    tvec: fitted.parameterValues.slice(3, 6),
  };
}
