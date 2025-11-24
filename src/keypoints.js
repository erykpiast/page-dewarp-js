import { projectXY } from "./projection.js";

/**
 * Builds an index mapping each keypoint to its position in the parameter vector.
 * @param {Array<number>} spanCounts
 * @returns {Array<[number, number]>}
 */
export function makeKeypointIndex(spanCounts) {
  const nSpans = spanCounts.length;
  const nPts = spanCounts.reduce((a, b) => a + b, 0);

  // 2D array (npts+1, 2)
  // We represent it as array of [idx, span_idx]
  const keypointIndex = [];
  for (let i = 0; i <= nPts; i++) keypointIndex.push([0, 0]);

  let start = 1;
  for (let i = 0; i < nSpans; i++) {
    const count = spanCounts[i];
    const end = start + count;
    for (let k = start; k < end; k++) {
      keypointIndex[k][1] = 8 + i; // span index in pvec
    }
    start = end;
  }

  for (let i = 1; i <= nPts; i++) {
    keypointIndex[i][0] = i - 1 + 8 + nSpans; // point index in pvec (xcoords)
  }

  return keypointIndex;
}

/**
 * Projects all keypoints using the current parameters.
 * @param {Array<number>} pvec
 * @param {Array<[number, number]>} keypointIndex
 * @returns {Array<[number, number]>}
 */
export function projectKeypoints(pvec, keypointIndex) {
  // pvec is flat array
  // xy_coords = pvec[keypoint_index]
  // keypointIndex tells us where to get y (from span) and x (from point)

  // In Python:
  // xy_coords = pvec[keypoint_index] -> shape (N+1, 2)
  // xy_coords[0, :] = 0

  const xyCoords = [];

  // First point (dummy) is 0,0
  xyCoords.push([0, 0]);

  for (let i = 1; i < keypointIndex.length; i++) {
    const idxX = keypointIndex[i][0];
    const idxY = keypointIndex[i][1];
    const x = pvec[idxX];
    const y = pvec[idxY];
    xyCoords.push([x, y]);
  }

  return projectXY(xyCoords, pvec);
}
