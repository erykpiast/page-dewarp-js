import { Config } from "./config.js";
import { solvePnP } from "./solvepnp/index.js";

export function getDefaultParams(corners, ycoords, xcoords) {
  function dist(p1, p2) {
    return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
  }

  const pageWidth = dist(corners[0], corners[1]);
  const pageHeight = dist(corners[0], corners[3]);

  // Construct 3D object points (Z=0) matching the 4 corners order
  // corners: [top-left, top-right, bottom-right, bottom-left] (usually)
  // Mapping:
  // 0 -> (0,0)
  // 1 -> (w,0)
  // 2 -> (w,h)
  // 3 -> (0,h)

  const objectPoints = [
    [0, 0, 0],
    [pageWidth, 0, 0],
    [pageWidth, pageHeight, 0],
    [0, pageHeight, 0],
  ];

  const imagePoints = corners; // Already in array of [u, v] format?
  // corners is likely array of [x, y] arrays.

  const f = Config.FOCAL_LENGTH;
  const cameraMatrix = [f, 0, 0, 0, f, 0, 0, 0, 1];
  const distCoeffs = []; // No distortion assumed for initial guess

  if (Config.DEBUG_LEVEL >= 1) {
    console.log(`  Running solvePnP on ${objectPoints.length} points...`);
  }

  const solution = solvePnP(
    objectPoints,
    imagePoints,
    cameraMatrix,
    distCoeffs
  );

  if (Config.DEBUG_LEVEL >= 1) {
    console.log(`  solvePnP success: ${solution.success}`);
    console.log(`  rvec: ${solution.rvec}`);
    console.log(`  tvec: ${solution.tvec}`);
  }

  const refinedParams = [...solution.rvec, ...solution.tvec];

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
