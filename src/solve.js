import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { minimize } from "./optimise.js";
import { projectXY } from "./projection.js";

export function getDefaultParams(corners, ycoords, xcoords) {
  const cv = getOpenCV();

  function dist(p1, p2) {
    return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
  }

  const pageWidth = dist(corners[0], corners[1]);
  const pageHeight = dist(corners[0], corners[3]);

  const srcPtsData = []; // Object points (x,y)
  const dstPtsData = []; // Image points (u,v)

  // 0,0 -> c0
  srcPtsData.push(0, 0);
  dstPtsData.push(corners[0][0], corners[0][1]);
  // w,0 -> c1
  srcPtsData.push(pageWidth, 0);
  dstPtsData.push(corners[1][0], corners[1][1]);
  // w,h -> c2
  srcPtsData.push(pageWidth, pageHeight);
  dstPtsData.push(corners[2][0], corners[2][1]);
  // 0,h -> c3
  srcPtsData.push(0, pageHeight);
  dstPtsData.push(corners[3][0], corners[3][1]);

  const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, srcPtsData);
  const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, dstPtsData);

  const H = cv.findHomography(srcMat, dstMat);

  // Decompose H to R, t
  const f = Config.FOCAL_LENGTH;

  const h00 = H.doubleAt(0, 0),
    h01 = H.doubleAt(0, 1),
    h02 = H.doubleAt(0, 2);
  const h10 = H.doubleAt(1, 0),
    h11 = H.doubleAt(1, 1),
    h12 = H.doubleAt(1, 2);
  const h20 = H.doubleAt(2, 0),
    h21 = H.doubleAt(2, 1),
    h22 = H.doubleAt(2, 2);

  // Multiply by K_inv
  // r1' = [h00/f, h10/f, h20]
  let r1x = h00 / f,
    r1y = h10 / f,
    r1z = h20;
  let r2x = h01 / f,
    r2y = h11 / f,
    r2z = h21;
  let tx = h02 / f,
    ty = h12 / f,
    tz = h22;

  // Normalize r1
  const norm1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z);
  r1x /= norm1;
  r1y /= norm1;
  r1z /= norm1;

  // Normalize r2
  const norm2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z);

  const scale = (norm1 + norm2) / 2;
  r2x /= scale;
  r2y /= scale;
  r2z /= scale;
  tx /= scale;
  ty /= scale;
  tz /= scale;

  // Enforce orthogonality: r3 = r1 x r2
  let r3x = r1y * r2z - r1z * r2y;
  let r3y = r1z * r2x - r1x * r2z;
  let r3z = r1x * r2y - r1y * r2x;

  // Normalize r3
  const norm3 = Math.sqrt(r3x * r3x + r3y * r3y + r3z * r3z);
  r3x /= norm3;
  r3y /= norm3;
  r3z /= norm3;

  // Recompute r2 = r3 x r1
  r2x = r3y * r1z - r3z * r1y;
  r2y = r3z * r1x - r3x * r1z;
  r2z = r3x * r1y - r3y * r1x;

  // Rotation matrix R
  const R_data = [r1x, r2x, r3x, r1y, r2y, r3y, r1z, r2z, r3z];
  const R = cv.matFromArray(3, 3, cv.CV_64F, R_data);

  const rvec = new cv.Mat();
  cv.Rodrigues(R, rvec);

  // Initial rvec and tvec from Homography
  let currentRvec = [
    rvec.doubleAt(0, 0),
    rvec.doubleAt(1, 0),
    rvec.doubleAt(2, 0),
  ];
  let currentTvec = [tx, ty, tz];

  // Refine using Iterative Optimization (similar to SOLVEPNP_ITERATIVE)
  // Minimize reprojection error of the 4 corners

  const objCorners2D = [
    [0, 0],
    [pageWidth, 0],
    [pageWidth, pageHeight],
    [0, pageHeight],
  ];

  function pnpObjective(params6) {
    // params6 is [rx, ry, rz, tx, ty, tz]
    // projectXY expects full pvec. We construct a dummy one with 0 cubic terms.
    const rvecData = params6.slice(0, 3);
    const tvecData = params6.slice(3, 6);

    // Full pvec structure: [rx,ry,rz, tx,ty,tz, alpha, beta]
    const fullPvec = [...rvecData, ...tvecData, 0.0, 0.0];

    // projectXY uses the same K as we assumed (from Config)
    const projected = projectXY(objCorners2D, fullPvec);

    let err = 0;
    for (let i = 0; i < 4; i++) {
      const dx = projected[i][0] - corners[i][0];
      const dy = projected[i][1] - corners[i][1];
      err += dx * dx + dy * dy;
    }
    return err;
  }

  const initialParams6 = [...currentRvec, ...currentTvec];

  if (Config.DEBUG_LEVEL >= 1) {
    console.log(`  Initial PnP Error: ${pnpObjective(initialParams6)}`);
  }

  // Use the minimize function we implemented (Coordinate Descent)
  const refined = minimize(pnpObjective, initialParams6, {
    maxIter: 50,
    tol: 1e-6,
  });

  if (Config.DEBUG_LEVEL >= 1) {
    console.log(`  Refined PnP Error: ${refined.fx}`);
  }

  const refinedParams = refined.x;

  // Cleanup
  srcMat.delete();
  dstMat.delete();
  H.delete();
  R.delete();
  rvec.delete();

  const spanCounts = xcoords.map((xc) => xc.length);

  const params = [];

  // rvec
  params.push(refinedParams[0], refinedParams[1], refinedParams[2]);
  // tvec
  params.push(refinedParams[3], refinedParams[4], refinedParams[5]);
  // cubic
  params.push(0.0, 0.0);
  // ycoords
  ycoords.forEach((y) => params.push(y));
  // xcoords
  xcoords.forEach((xc) => xc.forEach((x) => params.push(x)));

  return {
    pageDims: [pageWidth, pageHeight],
    spanCounts,
    params,
  };
}
