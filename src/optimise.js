import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { debugShow } from "./debug.js";
import { makeKeypointIndex, projectKeypoints } from "./keypoints.js";
import { norm2pix } from "./utils.js";

// --- Optimization Helpers (Coordinate Descent / Golden Section) ---

function bracketMinimum(f, x0, s = 0.1) {
  let a = x0;
  let b = x0 + s;
  let fa = f(a);
  let fb = f(b);

  if (fb > fa) {
    s = -s;
    b = x0 + s;
    fb = f(b);
    if (fb > fa) {
      // Bracketed: x0-s < x0 < x0+s (if initial s was positive)
      // a=x0, b=x0+s (bad), new_b=x0-s (bad)
      // points: x0-s, x0, x0+s
      // fa was min.
      return { a: x0 - Math.abs(s), b: x0, c: x0 + Math.abs(s) };
    }
  }

  let c = b + s;
  let fc = f(c);

  let iter = 0;
  while (fc < fb && iter < 50) {
    a = b;
    fa = fb;
    b = c;
    fb = fc;
    s *= 1.618;
    c = b + s;
    fc = f(c);
    iter++;
  }

  if (a > c) {
    const tmp = a;
    a = c;
    c = tmp;
  }
  return { a, b, c };
}

function goldenSectionSearch(f, a, b, c, tol) {
  const phi = 1.61803398875;
  const resphi = 2 - phi;

  let x0 = a;
  let x3 = c;
  let x1, x2;

  if (Math.abs(c - b) > Math.abs(b - a)) {
    x1 = b;
    x2 = b + resphi * (c - b);
  } else {
    x2 = b;
    x1 = b - resphi * (b - a);
  }

  let f1 = f(x1);
  let f2 = f(x2);

  let iter = 0;
  while (
    Math.abs(x3 - x0) > tol * (Math.abs(x1) + Math.abs(x2)) &&
    iter < 100
  ) {
    if (f2 < f1) {
      x0 = x1;
      x1 = x2;
      x2 = resphi * x1 + (1 - resphi) * x3;
      f1 = f2;
      f2 = f(x2);
    } else {
      x3 = x2;
      x2 = x1;
      x1 = resphi * x2 + (1 - resphi) * x0;
      f2 = f1;
      f1 = f(x1);
    }
    iter++;
  }

  return f1 < f2 ? x1 : x2;
}

function optimize1D(f, x0, tol) {
  const { a, b, c } = bracketMinimum(f, x0);
  return goldenSectionSearch(f, a, b, c, tol);
}

// --- Main Minimize Function ---

export function minimize(objective, initialParams, options = {}) {
  const maxIter = options.maxIter || 20;
  const tol = options.tol || 1e-4;
  const log = options.log || false;

  let x = Float64Array.from(initialParams);
  const N = x.length;
  let currentFx = objective(x);

  for (let iter = 1; iter <= maxIter; iter++) {
    const startFx = currentFx;

    for (let i = 0; i < N; i++) {
      // Optimize parameter i
      const f1d = (val) => {
        const oldVal = x[i];
        x[i] = val;
        const res = objective(x);
        x[i] = oldVal; // Restore
        return res;
      };

      const bestVal = optimize1D(f1d, x[i], tol);
      x[i] = bestVal;

      currentFx = objective(x);
    }

    if (log && iter % 1 === 0) {
      console.log(`  iter ${iter}: loss ${currentFx.toFixed(4)}`);
    }

    if (Math.abs(startFx - currentFx) < tol) {
      break;
    }
  }

  return { x: Array.from(x), fx: currentFx };
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

  console.log(
    `  optimizing ${params.length} parameters using Coordinate Descent...`
  );

  const start = Date.now();
  const solution = minimize(objective, params, {
    log: true,
    maxIter: 20,
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
