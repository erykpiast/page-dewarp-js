import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { DebugMetrics } from "./debug-metrics.js";
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

function brentSearch(f, a, b, c, tol) {
  const CGOLD = 0.381966;
  const ZEPS = 1e-10;
  const ITMAX = 100;

  let x = b;
  let w = b;
  let v = b;
  let fx = f(x);
  let fw = fx;
  let fv = fx;
  let e = 0.0;
  let d = 0.0;

  for (let iter = 0; iter < ITMAX; iter++) {
    const xm = 0.5 * (a + c);
    const tol1 = tol * Math.abs(x) + ZEPS;
    const tol2 = 2.0 * tol1;

    if (Math.abs(x - xm) <= tol2 - 0.5 * (c - a)) {
      return x;
    }

    let u;
    if (Math.abs(e) > tol1) {
      const r = (x - w) * (fx - fv);
      let q = (x - v) * (fx - fw);
      let p = (x - v) * q - (x - w) * r;
      q = 2.0 * (q - r);
      if (q > 0.0) p = -p;
      q = Math.abs(q);
      const etemp = e;
      e = d;

      if (
        Math.abs(p) >= Math.abs(0.5 * q * etemp) ||
        p <= q * (a - x) ||
        p >= q * (c - x)
      ) {
        e = x >= xm ? a - x : c - x;
        d = CGOLD * e;
      } else {
        d = p / q;
        u = x + d;
        if (u - a < tol2 || c - u < tol2) {
          d = xm - x >= 0 ? tol1 : -tol1;
        }
      }
    } else {
      e = x >= xm ? a - x : c - x;
      d = CGOLD * e;
    }

    u = Math.abs(d) >= tol1 ? x + d : x + (d >= 0 ? tol1 : -tol1);
    const fu = f(u);

    if (fu <= fx) {
      if (u >= x) {
        a = x;
      } else {
        c = x;
      }
      v = w;
      w = x;
      x = u;
      fv = fw;
      fw = fx;
      fx = fu;
    } else {
      if (u < x) {
        a = u;
      } else {
        c = u;
      }
      if (fu <= fw || w === x) {
        v = w;
        w = u;
        fv = fw;
        fw = fu;
      } else if (fu <= fv || v === x || v === w) {
        v = u;
        fv = fu;
      }
    }
  }

  return x;
}

function optimize1D(f, x0, tol) {
  const { a, b, c } = bracketMinimum(f, x0);
  return brentSearch(f, a, b, c, tol);
}

// --- Main Minimize Function ---

function lineSearchAlongDirection(x, direction, objective, tol, scratch) {
  let maxComponent = 0;
  for (let i = 0; i < direction.length; i++) {
    maxComponent = Math.max(maxComponent, Math.abs(direction[i]));
  }
  if (maxComponent < 1e-12) {
    return { alpha: 0, fx: objective(x) };
  }

  const phi = (alpha) => {
    for (let i = 0; i < x.length; i++) {
      scratch[i] = x[i] + alpha * direction[i];
    }
    return objective(scratch);
  };

  const alpha = optimize1D(phi, 0, tol);
  for (let i = 0; i < x.length; i++) {
    x[i] = x[i] + alpha * direction[i];
  }
  const fx = objective(x);
  return { alpha, fx };
}

/**
 * Implements Powell's method (derivative-free optimization using sequential 1D line searches).
 * @param {Function} objective
 * @param {Array<number>} initialParams
 * @param {Object} options
 * @returns {{ x: Array<number>, fx: number }}
 */
export function minimize(objective, initialParams, options = {}) {
  const maxIter = options.maxIter ?? Config.OPTIM_MAX_ITER;
  const tol = options.tol ?? Config.OPTIM_TOL;
  const log = options.log ?? false;

  const x = Float64Array.from(initialParams);
  const n = x.length;
  let fx = objective(x);

  const directions = [];
  for (let i = 0; i < n; i++) {
    const dir = new Float64Array(n);
    dir[i] = 1;
    directions.push(dir);
  }

  const scratch = new Float64Array(n);
  const xOld = new Float64Array(n);
  const pt = new Float64Array(n);
  const delta = new Float64Array(n);

  for (let iter = 1; iter <= maxIter; iter++) {
    xOld.set(x);
    const fxOld = fx;
    let biggestDecrease = 0;
    let biggestIdx = -1;

    for (let i = 0; i < n; i++) {
      const dir = directions[i];
      const fBefore = fx;
      const { alpha, fx: fxAfter } = lineSearchAlongDirection(
        x,
        dir,
        objective,
        tol,
        scratch
      );
      if (alpha !== 0) {
        const decrease = fBefore - fxAfter;
        if (decrease > biggestDecrease) {
          biggestDecrease = decrease;
          biggestIdx = i;
        }
        fx = fxAfter;
      }
    }

    let converged = Math.abs(fxOld - fx) < tol;

    for (let i = 0; i < n; i++) {
      delta[i] = x[i] - xOld[i];
      pt[i] = x[i] + delta[i];
    }

    const fpt = objective(pt);
    if (
      fpt < fx &&
      biggestIdx !== -1 &&
      2 * (fxOld - 2 * fx + fpt) * Math.pow(fxOld - fx - biggestDecrease, 2) <
        biggestDecrease * Math.pow(fxOld - fpt, 2)
    ) {
      const { alpha, fx: fxAfter } = lineSearchAlongDirection(
        x,
        delta,
        objective,
        tol,
        scratch
      );
      if (alpha !== 0) {
        fx = fxAfter;
        directions[biggestIdx] = Float64Array.from(delta);
        converged = false;
      }
    }

    if (log) {
      console.log(`  iter ${iter}: loss ${fx.toFixed(4)}`);
    }

    if (converged) {
      break;
    }
  }

  return { x: Array.from(x), fx };
}

/**
 * Refines the page model to minimize reprojection error.
 * @param {string} name
 * @param {cv.Mat} small
 * @param {Array<[number, number]>} dstpoints
 * @param {Array<number>} spanCounts
 * @param {Array<number>} params
 * @returns {Promise<Array<number>>}
 */
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

  DebugMetrics.add("initial_params", Array.from(params));
  DebugMetrics.add("initial_cost", initialLoss);

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
    `  optimizing ${params.length} parameters using Powell's method...`
  );

  const start = Date.now();
  const solution = minimize(objective, params, {
    log: true,
    maxIter: Config.OPTIM_MAX_ITER,
    tol: Config.OPTIM_TOL,
  });
  const end = Date.now();

  const optimizationTime = (end - start) / 1000;
  console.log(`  optimization took ${optimizationTime} sec.`);
  console.log(`  final objective is ${solution.fx}`);

  const newParams = solution.x;

  DebugMetrics.add("final_params", newParams);
  DebugMetrics.add("final_cost", solution.fx);
  DebugMetrics.add("optimization_time", optimizationTime);

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
