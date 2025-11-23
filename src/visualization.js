import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { projectXY } from "./projection.js";
import { norm2pix } from "./utils.js";
import { debugShow } from "./debug.js";

export async function drawProjectedGrid(name, small, params, pageDims) {
  const cv = getOpenCV();
  // Clone image to draw on
  const display = small.clone();

  const [pageWidth, pageHeight] = pageDims;

  // Grid settings
  const NUM_V_LINES = 21;
  const NUM_H_LINES = 21;
  const POINTS_PER_LINE = 50;

  // Vertical lines: constant x, varying y
  // Draw Cyan lines
  const vLineX = linspace(0, pageWidth, NUM_V_LINES);
  const vLineY = linspace(0, pageHeight, POINTS_PER_LINE);
  const cyan = new cv.Scalar(0, 255, 255, 255); // R, G, B, A

  for (const x of vLineX) {
    const linePoints = vLineY.map((y) => [x, y]);
    const projPoints = projectXY(linePoints, params);
    const pixPoints = norm2pix(small, projPoints);
    drawPolyline(cv, display, pixPoints, cyan);
  }

  // Horizontal lines: constant y, varying x
  // Draw Magenta lines
  const hLineY = linspace(0, pageHeight, NUM_H_LINES);
  const hLineX = linspace(0, pageWidth, POINTS_PER_LINE);
  const magenta = new cv.Scalar(255, 0, 255, 255); // R, G, B, A

  for (const y of hLineY) {
    const linePoints = hLineX.map((x) => [x, y]);
    const projPoints = projectXY(linePoints, params);
    const pixPoints = norm2pix(small, projPoints);
    drawPolyline(cv, display, pixPoints, magenta);
  }

  await debugShow(name, 5, "warped_grid", display);
  display.delete();
}

function drawPolyline(cv, img, points, color) {
  if (points.length < 2) return;

  // Simple line loop
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = new cv.Point(points[i][0], points[i][1]);
    const p2 = new cv.Point(points[i + 1][0], points[i + 1][1]);
    cv.line(img, p1, p2, color, 1, cv.LINE_AA, 0);
  }
}

function linspace(start, end, num) {
  if (num < 2) return num === 1 ? [start] : [];
  const step = (end - start) / (num - 1);
  const arr = [];
  for (let i = 0; i < num; i++) arr.push(start + i * step);
  return arr;
}

