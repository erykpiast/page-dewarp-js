import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { cCOLOURS, debugShow } from "./debug.js";
import { norm2pix, pix2norm } from "./utils.js";

function angleDist(angleB, angleA) {
  let diff = angleB - angleA;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff);
}

function generateCandidateEdge(cinfoA, cinfoB) {
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

  if (
    dist > Config.EDGE_MAX_LENGTH ||
    xOverlap > Config.EDGE_MAX_OVERLAP ||
    deltaAngle > Config.EDGE_MAX_ANGLE
  ) {
    return null;
  }

  const score = dist + deltaAngle * Config.EDGE_ANGLE_COST;
  return { score, cinfoA, cinfoB };
}

export function assembleSpans(name, small, pagemask, cinfoList) {
  // Sort by y-coordinate (top to bottom)
  cinfoList.sort((a, b) => a.rect.y - b.rect.y);

  const candidateEdges = [];
  for (let i = 0; i < cinfoList.length; i++) {
    for (let j = 0; j < i; j++) {
      const edge = generateCandidateEdge(cinfoList[i], cinfoList[j]);
      if (edge) {
        candidateEdges.push(edge);
      }
    }
  }

  candidateEdges.sort((a, b) => a.score - b.score);

  for (const { cinfoA, cinfoB } of candidateEdges) {
    if (!cinfoA.succ && !cinfoB.pred) {
      cinfoA.succ = cinfoB;
      cinfoB.pred = cinfoA;
    }
  }

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
    }
  }

  if (Config.DEBUG_LEVEL >= 2) {
    visualizeSpans(name, small, pagemask, spans);
  }

  return spans;
}

export function sampleSpans(shape, spans) {
  const spanPoints = [];
  const cv = getOpenCV();

  for (const span of spans) {
    const contourPoints = [];
    for (const cinfo of span) {
      // yvals = np.arange(mask.shape[0])
      // totals = (yvals * mask).sum(axis=0)
      // means = totals / mask.sum(axis=0)
      // This logic calculates the vertical center of mass of the mask column by column?
      // Python code iterates per contour.

      // In JS, accessing pixels is slow if we do it manually.
      // cinfo.mask is a Mat.
      // We can iterate columns.
      const { width, height } = cinfo.rect;
      // mask is tight mask of size (height, width)

      // mask.data is Uint8Array
      const maskData = cinfo.mask.data;
      const stride = cinfo.mask.cols;

      // We need column sums and column weighted sums.
      const colSums = new Int32Array(width).fill(0);
      const colWeightedSums = new Int32Array(width).fill(0);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const val = maskData[y * stride + x];
          if (val > 0) {
            // usually 1 or 255
            colSums[x] += val;
            colWeightedSums[x] += y * val;
          }
        }
      }

      const means = [];
      for (let x = 0; x < width; x++) {
        if (colSums[x] > 0) {
          means.push(colWeightedSums[x] / colSums[x]);
        } else {
          means.push(0); // Should handle gaps?
        }
      }

      const step = Config.SPAN_PX_PER_STEP;
      const start = Math.floor(((means.length - 1) % step) / 2);

      const { x: xmin, y: ymin } = cinfo.rect;

      for (let x = start; x < means.length; x += step) {
        // Filter out zero columns if needed? Python doesn't seem to filter explicitly
        // but mask usually implies non-zero area.
        // If colSums[x] is 0, mean is undefined/NaN. Python divides by sum.
        if (colSums[x] > 0) {
          contourPoints.push([x + xmin, means[x] + ymin]);
        }
      }
    }

    // Normalize points
    if (contourPoints.length > 0) {
      spanPoints.push(pix2norm(shape, contourPoints));
    }
  }
  return spanPoints;
}

export function keypointsFromSamples(
  name,
  small,
  pagemask,
  page_outline,
  spanPoints
) {
  const cv = getOpenCV();

  // Helper for PCA on a set of points
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
    } else {
      if (cXX >= cYY) {
        vx = 1;
        vy = 0;
      } else {
        vx = 0;
        vy = 1;
      }
    }

    // Ensure vector points roughly left-to-right (positive x)
    // effectively aligning with text direction
    if (vx < 0) {
      vx = -vx;
      vy = -vy;
    }

    return [vx, vy];
  }

  // Weighted average of local PCAs
  let allEvecX = 0;
  let allEvecY = 0;
  let allWeights = 0;

  for (const points of spanPoints) {
    if (points.length < 2) continue;

    const [vx, vy] = getPrincipalAxis(points);
    const pFirst = points[0];
    const pLast = points[points.length - 1];

    // Weight by span length
    const weight = Math.sqrt(
      Math.pow(pLast[0] - pFirst[0], 2) + Math.pow(pLast[1] - pFirst[1], 2)
    );

    allEvecX += vx * weight;
    allEvecY += vy * weight;
    allWeights += weight;
  }

  // Handle case with no valid spans
  if (allWeights === 0) {
    allEvecX = 1;
    allEvecY = 0;
    allWeights = 1;
  }

  const avgVx = allEvecX / allWeights;
  const avgVy = allEvecY / allWeights;

  // Normalize
  const norm = Math.sqrt(avgVx * avgVx + avgVy * avgVy);
  let x_dir = [avgVx / norm, avgVy / norm];

  if (x_dir[0] < 0) x_dir = [-x_dir[0], -x_dir[1]];
  const y_dir = [-x_dir[1], x_dir[0]];

  // Page corners from page_outline (pixels) -> normalized -> projected to axes
  const pageCoordsNorm = pix2norm(pagemask, page_outline);

  // Project pageCoordsNorm onto x_dir and y_dir
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
    getCorner(px0, py0), // TL
    getCorner(px1, py0), // TR
    getCorner(px1, py1), // BR
    getCorner(px0, py1), // BL
  ];

  const xcoords = [];
  const ycoords = [];

  for (const points of spanPoints) {
    const px = points.map((p) => p[0] * x_dir[0] + p[1] * x_dir[1]);
    const py = points.map((p) => p[0] * y_dir[0] + p[1] * y_dir[1]);

    // xcoords relative to px0
    xcoords.push(px.map((v) => v - px0));

    // ycoords mean relative to py0
    const meanY = py.reduce((a, b) => a + b, 0) / py.length;
    ycoords.push(meanY - py0);
  }

  if (Config.DEBUG_LEVEL >= 2) {
    visualizeSpanPoints(name, small, spanPoints, corners);
  }

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
