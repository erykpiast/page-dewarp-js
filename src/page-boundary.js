import { projectXY } from "./projection.js";
import { norm2pix } from "./utils.js";

/**
 * Projects page boundary corners through the cubic surface model to get curved boundaries.
 * @param {Array<[number, number]>} corners - The 4 corner points in normalized page coordinates
 * @param {Array<number>} pageDims - [pageWidth, pageHeight] in normalized coordinates
 * @param {Array<number>} params - Parameter vector containing rvec, tvec, and cubic params
 * @param {number} samplesPerEdge - Number of sample points per edge (default: 50)
 * @returns {Object} Object containing curved boundary points for each edge
 */
export function projectPageBoundary(corners, pageDims, params, samplesPerEdge = 50) {
  const [pageWidth, pageHeight] = pageDims;

  // Extract the four corners (already in normalized coordinates)
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;

  // Sample points along each edge
  const edges = {
    top: [],
    right: [],
    bottom: [],
    left: []
  };

  // Top edge: from topLeft to topRight
  for (let i = 0; i <= samplesPerEdge; i++) {
    const t = i / samplesPerEdge;
    const x = topLeft[0] + t * (topRight[0] - topLeft[0]);
    const y = topLeft[1] + t * (topRight[1] - topLeft[1]);
    edges.top.push([x, y]);
  }

  // Right edge: from topRight to bottomRight
  for (let i = 0; i <= samplesPerEdge; i++) {
    const t = i / samplesPerEdge;
    const x = topRight[0] + t * (bottomRight[0] - topRight[0]);
    const y = topRight[1] + t * (bottomRight[1] - topRight[1]);
    edges.right.push([x, y]);
  }

  // Bottom edge: from bottomRight to bottomLeft
  for (let i = 0; i <= samplesPerEdge; i++) {
    const t = i / samplesPerEdge;
    const x = bottomRight[0] + t * (bottomLeft[0] - bottomRight[0]);
    const y = bottomRight[1] + t * (bottomLeft[1] - bottomRight[1]);
    edges.bottom.push([x, y]);
  }

  // Left edge: from bottomLeft to topLeft
  for (let i = 0; i <= samplesPerEdge; i++) {
    const t = i / samplesPerEdge;
    const x = bottomLeft[0] + t * (topLeft[0] - bottomLeft[0]);
    const y = bottomLeft[1] + t * (topLeft[1] - bottomLeft[1]);
    edges.left.push([x, y]);
  }

  // Project all edge points through the cubic surface model
  const projectedEdges = {
    top: projectXY(edges.top, params),
    right: projectXY(edges.right, params),
    bottom: projectXY(edges.bottom, params),
    left: projectXY(edges.left, params)
  };

  return projectedEdges;
}

/**
 * Converts projected boundary from normalized to pixel coordinates.
 * @param {Object} projectedEdges - Edges with points in normalized coordinates
 * @param {Object} imgShape - Image shape object with rows and cols
 * @returns {Object} Edges with points in pixel coordinates
 */
export function boundaryToPixels(projectedEdges, imgShape) {
  const pixelEdges = {};

  for (const [edge, points] of Object.entries(projectedEdges)) {
    pixelEdges[edge] = norm2pix(imgShape, points);
  }

  return pixelEdges;
}

/**
 * Computes the minimal page area to keep in the dewarped output.
 * Traces the boundary inward to find valid content region.
 * @param {Object} projectedEdges - Curved boundary edges in normalized coordinates
 * @param {Array<number>} pageDims - [pageWidth, pageHeight] in normalized coordinates
 * @returns {Object} Crop bounds {xMin, xMax, yMin, yMax} in page coordinates
 */
export function computeMinimalPageArea(projectedEdges, pageDims) {
  const [pageWidth, pageHeight] = pageDims;

  // For now, we'll compute a simple bounding box
  // In the future, this could trace inward along the curvature

  // Find the extrema of the curved boundaries
  let xMin = pageWidth;
  let xMax = 0;
  let yMin = pageHeight;
  let yMax = 0;

  // Analyze all edge points to find the actual page bounds
  for (const points of Object.values(projectedEdges)) {
    for (const [x, y] of points) {
      // Skip invalid points
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      // We're working in the original projected space
      // Need to reverse-map to page coordinates
      // This is simplified for now - full implementation would
      // require inverse projection
    }
  }

  // For initial implementation, return full page
  // This will be enhanced to compute actual minimal bounds
  return {
    xMin: 0,
    xMax: pageWidth,
    yMin: 0,
    yMax: pageHeight
  };
}

/**
 * Creates a mask for the valid page region based on curved boundaries.
 * @param {Object} pixelEdges - Boundary edges in pixel coordinates
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {cv.Mat} Binary mask of the page region
 */
export function createPageRegionMask(pixelEdges, width, height, cv) {
  const mask = new cv.Mat.zeros(height, width, cv.CV_8UC1);

  // Combine all edge points to create a closed contour
  const contourPoints = [];

  // Add points in order to form a closed polygon
  contourPoints.push(...pixelEdges.top);
  contourPoints.push(...pixelEdges.right);
  contourPoints.push(...pixelEdges.bottom.reverse());
  contourPoints.push(...pixelEdges.left.reverse());

  // Convert to OpenCV format
  const contourMat = new cv.Mat(contourPoints.length, 1, cv.CV_32SC2);
  for (let i = 0; i < contourPoints.length; i++) {
    contourMat.intPtr(i, 0)[0] = Math.round(contourPoints[i][0]);
    contourMat.intPtr(i, 0)[1] = Math.round(contourPoints[i][1]);
  }

  // Draw filled polygon
  const contours = new cv.MatVector();
  contours.push_back(contourMat);
  cv.drawContours(mask, contours, 0, new cv.Scalar(255), -1);

  contourMat.delete();
  contours.delete();

  return mask;
}

/**
 * Draws the curved page boundary on an image for visualization.
 * @param {cv.Mat} img - Image to draw on
 * @param {Object} pixelEdges - Boundary edges in pixel coordinates
 * @param {cv.Scalar} color - Line color (default: white)
 * @param {number} thickness - Line thickness (default: 2)
 */
export function drawPageBoundary(img, pixelEdges, cv, color = null, thickness = 2) {
  if (!color) {
    color = new cv.Scalar(255, 255, 255, 255);
  }

  // Draw each edge as a polyline
  for (const [edgeName, points] of Object.entries(pixelEdges)) {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Skip invalid points
      if (!Number.isFinite(p1[0]) || !Number.isFinite(p1[1]) ||
          !Number.isFinite(p2[0]) || !Number.isFinite(p2[1])) {
        continue;
      }

      cv.line(
        img,
        new cv.Point(Math.round(p1[0]), Math.round(p1[1])),
        new cv.Point(Math.round(p2[0]), Math.round(p2[1])),
        color,
        thickness
      );
    }
  }
}