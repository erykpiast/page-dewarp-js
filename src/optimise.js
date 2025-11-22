import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { debugShow } from "./debug.js";
import { makeKeypointIndex, projectKeypoints } from "./keypoints.js";
import { norm2pix } from "./utils.js";

export function minimize(objective, initialParams, options = {}) {
  const alpha = options.alpha || 0.01;
  const beta1 = options.beta1 || 0.9;
  const beta2 = options.beta2 || 0.999;
  const epsilon = options.epsilon || 1e-8;
  const maxIter = options.maxIter || 200;
  const h = options.h || 1e-4;
  const tol = options.tol || 1e-4;

  let theta = Float64Array.from(initialParams);
  const m = new Float64Array(theta.length).fill(0);
  const v = new Float64Array(theta.length).fill(0);
  const N = theta.length;

  let currentLoss = objective(theta);

  for (let t = 1; t <= maxIter; t++) {
    // Compute gradients (finite difference)
    const grads = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const oldVal = theta[i];
      theta[i] = oldVal + h;
      const lossP = objective(theta);
      theta[i] = oldVal;
      grads[i] = (lossP - currentLoss) / h;
    }

    // Adam update
    for (let i = 0; i < N; i++) {
      const g = grads[i];
      m[i] = beta1 * m[i] + (1 - beta1) * g;
      v[i] = beta2 * v[i] + (1 - beta2) * g * g;

      const mHat = m[i] / (1 - Math.pow(beta1, t));
      const vHat = v[i] / (1 - Math.pow(beta2, t));

      theta[i] = theta[i] - (alpha * mHat) / (Math.sqrt(vHat) + epsilon);
    }

    currentLoss = objective(theta); // Recompute loss at new theta

    if (options.log && t % 20 === 0) {
      console.log(`  iter ${t}: loss ${currentLoss.toFixed(4)}`);
    }

    if (currentLoss < tol) break;
  }

  return { x: Array.from(theta), fx: currentLoss };
}

export async function optimiseParams(
  name,
  small,
  dstpoints,
  spanCounts,
  params
) {
  const keypointIndex = makeKeypointIndex(spanCounts);

  function objective(p) {
    const ppts = projectKeypoints(p, keypointIndex);
    let sumSq = 0;
    for (let i = 0; i < dstpoints.length; i++) {
      const dx = dstpoints[i][0] - ppts[i][0];
      const dy = dstpoints[i][1] - ppts[i][1];
      sumSq += dx * dx + dy * dy;
    }
    return sumSq;
  }

  const initialLoss = objective(params);
  console.log(`  initial objective is ${initialLoss}`);

  if (Config.DEBUG_LEVEL >= 1) {
    const projpts = projectKeypoints(params, keypointIndex);
    await drawCorrespondences(
      name,
      small,
      dstpoints,
      projpts,
      "keypoints_before"
    );
  }

  console.log(`  optimizing ${params.length} parameters using Adam...`);

  const start = Date.now();
  const solution = minimize(objective, params, {
    log: true,
    maxIter: 500,
    alpha: 0.01,
    tol: 1e-4,
  });
  const end = Date.now();

  console.log(`  optimization took ${(end - start) / 1000} sec.`);
  console.log(`  final objective is ${solution.fx}`);

  const newParams = solution.x;

  if (Config.DEBUG_LEVEL >= 1) {
    const projpts = projectKeypoints(newParams, keypointIndex);
    await drawCorrespondences(
      name,
      small,
      dstpoints,
      projpts,
      "keypoints_after"
    );
  }

  return newParams;
}

async function drawCorrespondences(name, small, dstpoints, projpts, suffix) {
  const cv = getOpenCV();
  const display = small.clone();

  const pixDst = norm2pix(small, dstpoints);
  const pixProj = norm2pix(small, projpts);

  for (const p of pixProj) {
    cv.circle(
      display,
      new cv.Point(p[0], p[1]),
      3,
      new cv.Scalar(255, 0, 0, 255),
      -1
    );
  }

  for (const p of pixDst) {
    cv.circle(
      display,
      new cv.Point(p[0], p[1]),
      3,
      new cv.Scalar(0, 0, 255, 255),
      -1
    );
  }

  for (let i = 0; i < pixDst.length; i++) {
    const p1 = pixProj[i];
    const p2 = pixDst[i];
    cv.line(
      display,
      new cv.Point(p1[0], p1[1]),
      new cv.Point(p2[0], p2[1]),
      new cv.Scalar(255, 255, 255, 255),
      1
    );
  }

  await debugShow(name, 4, suffix, display);
  display.delete();
}
