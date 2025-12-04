#!/usr/bin/env node

import { loadOpenCV } from "./src/cv-loader.js";
import { WarpedImage } from "./src/image.js";
import { projectPageBoundary, boundaryToPixels, drawPageBoundary } from "./src/page-boundary.js";
import { getDefaultParams } from "./src/solve.js";
import { saveMat } from "./src/utils.js";
import { Config } from "./src/config.js";

async function testBoundaryVisualization() {
  await loadOpenCV();
  const cv = (await import("./src/cv-loader.js")).getOpenCV();

  // Process an example image
  const imagePath = process.argv[2] || "./test_data/boston_cooking_school_000000006.jpg";
  console.log(`Processing image: ${imagePath}`);

  const warpedImg = new WarpedImage(imagePath);
  await warpedImg.load();

  console.log("Calculating page extents...");
  warpedImg.calculatePageExtents();

  console.log("Getting contours...");
  warpedImg.contour_list = warpedImg.contourInfo();

  console.log("Assembling spans...");
  const spans = warpedImg.iterativelyAssembleSpans();

  if (!spans || spans.length < 1) {
    console.log("No spans found, exiting.");
    return;
  }

  const { sampleSpans } = await import("./src/spans.js");
  const { keypointsFromSamples } = await import("./src/spans.js");

  console.log("Sampling spans...");
  const spanPoints = sampleSpans(warpedImg.small, spans);

  console.log("Getting keypoints and corners...");
  const { corners, ycoords, xcoords, pageDims } = keypointsFromSamples(
    warpedImg.stem,
    warpedImg.small,
    warpedImg.pagemask,
    warpedImg.page_outline,
    spanPoints
  );

  // Get initial params (before optimization)
  console.log("Getting initial parameters...");
  const { params } = getDefaultParams(corners, ycoords, xcoords);

  // Project the page boundary through the cubic model
  console.log("Projecting page boundary...");
  const projectedEdges = projectPageBoundary(corners, pageDims, params, 100);
  const pixelEdges = boundaryToPixels(projectedEdges, warpedImg.small);

  // Create visualization
  console.log("Creating visualization...");
  const display = warpedImg.small.clone();

  // Draw the original rectangular corners in white
  const { norm2pix } = await import("./src/utils.js");
  const pixCorners = norm2pix(warpedImg.small, corners);
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

  // Draw the curved boundary in red
  drawPageBoundary(display, pixelEdges, cv, new cv.Scalar(0, 0, 255, 255), 3);

  // Save the visualization
  const outputPath = `${warpedImg.stem}_boundary_comparison.png`;
  console.log(`Saving visualization to ${outputPath}`);
  await saveMat(display, outputPath);

  display.delete();

  console.log("\nVisualization complete!");
  console.log("- White lines: Original rectangular page corners");
  console.log("- Red lines: Projected curved page boundary");
  console.log(`\nPage dimensions: ${pageDims[0].toFixed(2)} x ${pageDims[1].toFixed(2)}`);
}

testBoundaryVisualization().catch(console.error);