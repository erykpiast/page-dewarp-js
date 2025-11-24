import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { DebugMetrics } from "./debug-metrics.js";
import { cCOLOURS, debugShow } from "./debug.js";
import { norm2pix, pix2norm } from "./utils.js";

function angleDist(angleB, angleA) {
  let diff = angleB - angleA;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff);
}

function generateCandidateEdge(cinfoA, cinfoB, statsTracker) {
  if (cinfoA.point0[0] > cinfoB.point1[0]) {
    [cinfoA, cinfoB] = [cinfoB, cinfoA];
  }

  const xOverlapA = cinfoA.localOverlap(cinfoB);
  const xOverlapB = cinfoB.localOverlap(cinfoA);

  const overallTangent = [
    cinfoB.center[0] - cinfoA.center[0],
    cinfoB.center[1] - cinfoA.center[1],
  ];
  const overallAngle = Math.atan2(overallTangent[1], overallTangent[0]);

  const deltaAngle =
    (Math.max(
      angleDist(cinfoA.angle, overallAngle),
      angleDist(cinfoB.angle, overallAngle)
    ) *
      180) /
    Math.PI;

  const xOverlap = Math.max(xOverlapA, xOverlapB);
  const dist = Math.sqrt(
    Math.pow(cinfoB.point0[0] - cinfoA.point1[0], 2) +
      Math.pow(cinfoB.point0[1] - cinfoA.point1[1], 2)
  );

  const diag =
    statsTracker && statsTracker.edgeDiagnostics
      ? {
          a: cinfoA.debugId ?? cinfoA.debugIndex,
          b: cinfoB.debugId ?? cinfoB.debugIndex,
          dist,
          overlap: xOverlap,
          angle: deltaAngle,
        }
      : null;

  if (
    dist > Config.EDGE_MAX_LENGTH ||
    xOverlap > Config.EDGE_MAX_OVERLAP ||
    deltaAngle > Config.EDGE_MAX_ANGLE
  ) {
    if (statsTracker) {
      const { rejectionBreakdown } = statsTracker;
      if (dist > Config.EDGE_MAX_LENGTH) {
        rejectionBreakdown.distance++;
        if (diag) diag.reason = "distance";
      } else if (xOverlap > Config.EDGE_MAX_OVERLAP) {
        rejectionBreakdown.overlap++;
        if (diag) diag.reason = "overlap";
      } else if (deltaAngle > Config.EDGE_MAX_ANGLE) {
        rejectionBreakdown.angle++;
        if (diag) diag.reason = "angle";
      }
    }
    if (diag) {
      diag.accepted = false;
      statsTracker.edgeDiagnostics.push(diag);
    }
    return null;
  }

  if (statsTracker) {
    const { acceptedMetrics } = statsTracker;
    acceptedMetrics.distance.sum += dist;
    acceptedMetrics.distance.min = Math.min(acceptedMetrics.distance.min, dist);
    acceptedMetrics.distance.max = Math.max(acceptedMetrics.distance.max, dist);
    acceptedMetrics.distance.count++;

    acceptedMetrics.overlap.sum += xOverlap;
    acceptedMetrics.overlap.min = Math.min(
      acceptedMetrics.overlap.min,
      xOverlap
    );
    acceptedMetrics.overlap.max = Math.max(
      acceptedMetrics.overlap.max,
      xOverlap
    );
    acceptedMetrics.overlap.count++;

    acceptedMetrics.angle.sum += deltaAngle;
    acceptedMetrics.angle.min = Math.min(acceptedMetrics.angle.min, deltaAngle);
    acceptedMetrics.angle.max = Math.max(acceptedMetrics.angle.max, deltaAngle);
    acceptedMetrics.angle.count++;
  }

  const score = dist + deltaAngle * Config.EDGE_ANGLE_COST;
  if (diag) {
    diag.accepted = true;
    diag.score = score;
    statsTracker.edgeDiagnostics.push(diag);
  }
  return { score, cinfoA, cinfoB };
}

function sortContoursForAssembly(cinfoList) {
  cinfoList.sort(
    (a, b) =>
      a.rect.y - b.rect.y ||
      a.rect.x - b.rect.x ||
      a.rect.width - b.rect.width ||
      a.rect.height - b.rect.height
  );
  cinfoList.forEach((cinfo, idx) => {
    cinfo.debugIndex = idx;
    cinfo.debugId = `${cinfo.rect.x},${cinfo.rect.y},${cinfo.rect.width},${cinfo.rect.height}`;
  });
}

function generateAllCandidateEdges(cinfoList, stats) {
  const candidateEdges = [];

  for (let i = 0; i < cinfoList.length; i++) {
    for (let j = 0; j < i; j++) {
      stats.candidatePairs++;
      const edge = generateCandidateEdge(cinfoList[i], cinfoList[j], stats);
      if (edge) {
        candidateEdges.push(edge);
        stats.validEdges++;
      }
    }
  }

  return candidateEdges;
}

function linkContours(candidateEdges) {
  candidateEdges.sort((a, b) => a.score - b.score);

  for (const { cinfoA, cinfoB } of candidateEdges) {
    if (!cinfoA.succ && !cinfoB.pred) {
      cinfoA.succ = cinfoB;
      cinfoB.pred = cinfoA;
    }
  }
}

function extractSpans(cinfoList, stats) {
  const spans = [];
  const listCopy = [...cinfoList];

  while (listCopy.length > 0) {
    let cinfo = listCopy[0];
    while (cinfo.pred) cinfo = cinfo.pred;

    const curSpan = [];
    let width = 0.0;

    while (cinfo) {
      const idx = listCopy.indexOf(cinfo);
      if (idx > -1) listCopy.splice(idx, 1);

      curSpan.push(cinfo);
      width += cinfo.local_xrng[1] - cinfo.local_xrng[0];
      cinfo = cinfo.succ;
    }

    if (width > Config.SPAN_MIN_WIDTH) {
      spans.push(curSpan);
      stats.spanWidths.push(width);
      stats.spanSizes.push(curSpan.length);
    }
  }

  return spans;
}

/**
 * Groups contours into horizontal text lines using proximity/alignment scoring.
 * @param {string} name
 * @param {cv.Mat} small
 * @param {cv.Mat} pagemask
 * @param {Array<ContourInfo>} cinfoList
 * @returns {{ spans: Array<Array<ContourInfo>>, stats: Object }}
 */
export function assembleSpans(name, small, pagemask, cinfoList) {
  sortContoursForAssembly(cinfoList);

  const stats = {
    candidatePairs: 0,
    validEdges: 0,
    rejectionBreakdown: {
      distance: 0,
      overlap: 0,
      angle: 0,
    },
    linkedContours: 0,
    spanSizes: [],
    spanWidths: [],
    acceptedMetrics: {
      distance: { sum: 0, min: Infinity, max: -Infinity, count: 0 },
      overlap: { sum: 0, min: Infinity, max: -Infinity, count: 0 },
      angle: { sum: 0, min: Infinity, max: -Infinity, count: 0 },
    },
    edgeDiagnostics: [],
  };

  const candidateEdges = generateAllCandidateEdges(cinfoList, stats);
  linkContours(candidateEdges);
  
  stats.linkedContours = cinfoList.filter((c) => c.succ || c.pred).length;
  
  const spans = extractSpans(cinfoList, stats);

  if (Config.DEBUG_LEVEL >= 2) {
    visualizeSpans(name, small, pagemask, spans);
  }

  const finalizeMetric = (metric) =>
    metric.count
      ? {
          average: metric.sum / metric.count,
          min: metric.min,
          max: metric.max,
        }
      : { average: null, min: null, max: null };

  stats.acceptedMetrics = {
    distance: finalizeMetric(stats.acceptedMetrics.distance),
    overlap: finalizeMetric(stats.acceptedMetrics.overlap),
    angle: finalizeMetric(stats.acceptedMetrics.angle),
  };

  return { spans, stats };
}

function computeColumnMeans(mask, width, height) {
  const maskData = mask.data;
  const stride = mask.cols;

  const colSums = new Int32Array(width).fill(0);
  const colWeightedSums = new Int32Array(width).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = maskData[y * stride + x];
      if (val > 0) {
        colSums[x] += val;
        colWeightedSums[x] += y * val;
      }
    }
  }

  const means = [];
  for (let x = 0; x < width; x++) {
    means.push(colWeightedSums[x] / colSums[x]);
  }

  return means;
}

function sampleContourPoints(cinfo, step) {
  const { width, height } = cinfo.rect;
  const means = computeColumnMeans(cinfo.mask, width, height);

  const start = Math.floor(((means.length - 1) % step) / 2);
  const { x: xmin, y: ymin } = cinfo.rect;

  const points = [];
  for (let x = start; x < means.length; x += step) {
    points.push([x + xmin, means[x] + ymin]);
  }

  return points;
}

/**
 * Extracts evenly-spaced sample points along each span's center line.
 * @param {cv.Mat | Object} shape
 * @param {Array<Array<ContourInfo>>} spans
 * @returns {Array<Array<[number, number]>>}
 */
export function sampleSpans(shape, spans) {
  const spanPoints = [];
  const step = Config.SPAN_PX_PER_STEP;

  for (const span of spans) {
    const contourPoints = [];
    for (const cinfo of span) {
      const points = sampleContourPoints(cinfo, step);
      contourPoints.push(...points);
    }

    if (contourPoints.length > 0) {
      spanPoints.push(pix2norm(shape, contourPoints));
    }
  }
  return spanPoints;
}

function getPrincipalAxis(points) {
  if (points.length < 2) return [1, 0];

  let sumX = 0,
    sumY = 0;
  for (const p of points) {
    sumX += p[0];
    sumY += p[1];
  }
  const meanX = sumX / points.length;
  const meanY = sumY / points.length;

  let cXX = 0,
    cXY = 0,
    cYY = 0;
  for (const p of points) {
    const dx = p[0] - meanX;
    const dy = p[1] - meanY;
    cXX += dx * dx;
    cXY += dx * dy;
    cYY += dy * dy;
  }

  const T = cXX + cYY;
  const D = cXX * cYY - cXY * cXY;
  const L1 = T / 2 + Math.sqrt(Math.max(0, (T * T) / 4 - D));

  let vx, vy;
  if (Math.abs(cXY) > 1e-9) {
    const diff = cXX - L1;
    const theta = Math.atan2(-diff, cXY);
    vx = Math.cos(theta);
    vy = Math.sin(theta);
  } else if (cXX >= cYY) {
    vx = 1;
    vy = 0;
  } else {
    vx = 0;
    vy = 1;
  }

  if (vx < 0) {
    vx = -vx;
    vy = -vy;
  }

  return [vx, vy];
}

function computeGlobalPageAxes(spanPoints) {
  let allEvecX = 0;
  let allEvecY = 0;
  let allWeights = 0;

  const spanAxes = [];
  const spanWeights = [];
  
  for (const points of spanPoints) {
    if (points.length < 2) continue;

    const [vx, vy] = getPrincipalAxis(points);
    spanAxes.push([vx, vy]);
    const pFirst = points[0];
    const pLast = points[points.length - 1];

    const weight = Math.sqrt(
      Math.pow(pLast[0] - pFirst[0], 2) + Math.pow(pLast[1] - pFirst[1], 2)
    );
    spanWeights.push(weight);

    allEvecX += vx * weight;
    allEvecY += vy * weight;
    allWeights += weight;
  }

  if (allWeights === 0) {
    allEvecX = 1;
    allEvecY = 0;
    allWeights = 1;
  }

  const avgVx = allEvecX / allWeights;
  const avgVy = allEvecY / allWeights;

  let x_dir = [avgVx, avgVy];
  if (x_dir[0] < 0) x_dir = [-x_dir[0], -x_dir[1]];
  const y_dir = [-x_dir[1], x_dir[0]];

  return { x_dir, y_dir, spanAxes, spanWeights, allEvecX, allEvecY, allWeights };
}

function computePageCorners(pageCoordsNorm, x_dir, y_dir) {
  const px_coords = pageCoordsNorm.map(
    (p) => p[0] * x_dir[0] + p[1] * x_dir[1]
  );
  const py_coords = pageCoordsNorm.map(
    (p) => p[0] * y_dir[0] + p[1] * y_dir[1]
  );

  const px0 = Math.min(...px_coords);
  const px1 = Math.max(...px_coords);
  const py0 = Math.min(...py_coords);
  const py1 = Math.max(...py_coords);

  function getCorner(cx, cy) {
    return [cx * x_dir[0] + cy * y_dir[0], cx * x_dir[1] + cy * y_dir[1]];
  }

  const corners = [
    getCorner(px0, py0),
    getCorner(px1, py0),
    getCorner(px1, py1),
    getCorner(px0, py1),
  ];

  return { corners, px0, py0 };
}

function computeSpanCoordinates(spanPoints, x_dir, y_dir, px0, py0) {
  const xcoords = [];
  const ycoords = [];

  for (const points of spanPoints) {
    const px = points.map((p) => p[0] * x_dir[0] + p[1] * x_dir[1]);
    const py = points.map((p) => p[0] * y_dir[0] + p[1] * y_dir[1]);

    xcoords.push(px.map((v) => v - px0));

    const meanY = py.reduce((a, b) => a + b, 0) / py.length;
    ycoords.push(meanY - py0);
  }

  return { xcoords, ycoords };
}

/**
 * Computes page corners and normalized coordinates for optimization.
 * @param {string} name
 * @param {cv.Mat} small
 * @param {cv.Mat} pagemask
 * @param {Array<[number, number]>} page_outline
 * @param {Array<Array<[number, number]>>} spanPoints
 * @returns {{ corners: Array<[number, number]>, ycoords: Array<number>, xcoords: Array<Array<number>> }}
 */
export function keypointsFromSamples(
  name,
  small,
  pagemask,
  page_outline,
  spanPoints
) {
  const { x_dir, y_dir, spanAxes, spanWeights, allEvecX, allEvecY, allWeights } = 
    computeGlobalPageAxes(spanPoints);

  const pageCoordsNorm = pix2norm(pagemask, page_outline);
  const { corners, px0, py0 } = computePageCorners(pageCoordsNorm, x_dir, y_dir);
  const { xcoords, ycoords } = computeSpanCoordinates(spanPoints, x_dir, y_dir, px0, py0);

  if (Config.DEBUG_LEVEL >= 2) {
    visualizeSpanPoints(name, small, spanPoints, corners);
  }
  
  DebugMetrics.add("keypoint_axes", { x_dir, y_dir });
  DebugMetrics.add("keypoint_axis_sums", { allEvecX, allEvecY, allWeights });
  DebugMetrics.add("keypoint_corners", corners);
  DebugMetrics.add("keypoint_ycoords", ycoords);
  DebugMetrics.add("keypoint_xcoords_lengths", xcoords.map((pts) => pts.length));
  DebugMetrics.add("keypoint_xcoords_sample", xcoords.slice(0, 5).map((pts) => pts.slice(0, 5)));
  DebugMetrics.add("keypoint_span_axes_count", spanAxes.length);
  DebugMetrics.add("keypoint_span_axes", spanAxes);
  DebugMetrics.add("keypoint_span_weights", spanWeights);

  return { corners, ycoords, xcoords };
}

async function visualizeSpans(name, small, pagemask, spans) {
  const cv = getOpenCV();
  const display = small.clone();

  // Draw contours
  const contoursVec = new cv.MatVector();
  // Need to flatten spans to fill vector, but we want colors per span

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const spanVec = new cv.MatVector();
    for (const c of span) spanVec.push_back(c.contour);

    const colorArr = cCOLOURS[(i * 3) % cCOLOURS.length];
    const color = new cv.Scalar(colorArr[0], colorArr[1], colorArr[2], 255);
    cv.drawContours(display, spanVec, -1, color, -1);
    spanVec.delete();
  }

  // Blend logic omitted for brevity, just showing overlay
  await debugShow(name, 2, "spans", display);
  display.delete();
}

async function visualizeSpanPoints(name, small, spanPoints, corners) {
  const cv = getOpenCV();
  const display = small.clone();

  // Draw points
  let i = 0;
  for (const points of spanPoints) {
    const pixPoints = norm2pix(small, points);
    const colorArr = cCOLOURS[i % cCOLOURS.length];
    const color = new cv.Scalar(colorArr[0], colorArr[1], colorArr[2], 255);

    for (const p of pixPoints) {
      cv.circle(display, new cv.Point(p[0], p[1]), 3, color, -1);
    }
    i++;
  }

  // Draw corners
  const pixCorners = norm2pix(small, corners);
  for (let j = 0; j < 4; j++) {
    const p1 = pixCorners[j];
    const p2 = pixCorners[(j + 1) % 4];
    cv.line(
      display,
      new cv.Point(p1[0], p1[1]),
      new cv.Point(p2[0], p2[1]),
      new cv.Scalar(255, 255, 255, 255),
      2
    );
  }

  await debugShow(name, 3, "span_points", display);
  display.delete();
}
