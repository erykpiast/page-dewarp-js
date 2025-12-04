#!/usr/bin/env node

import { loadOpenCV } from "./src/cv-loader.js";
import { WarpedImage } from "./src/image.js";
import { projectPageBoundary, boundaryToPixels, drawPageBoundary } from "./src/page-boundary.js";
import { getDefaultParams } from "./src/solve.js";
import { optimiseParams } from "./src/optimise.js";
import { saveMat } from "./src/utils.js";
import { Config } from "./src/config.js";

async function testOptimizedBoundary() {
  await loadOpenCV();
  const cv = (await import("./src/cv-loader.js")).getOpenCV();

  // Process an example image
  const imagePath = process.argv[2] || "input.jpg";
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

  // Get initial params
  console.log("Getting initial parameters...");
  const { pageDims: roughDims, params: initialParams } = getDefaultParams(corners, ycoords, xcoords);

  // Optimize parameters
  console.log("Optimizing model parameters...");
  const optimizedParams = optimiseParams(corners, ycoords, xcoords, roughDims, initialParams);

  // Create visualization with both initial and optimized boundaries
  console.log("Creating visualization...");
  const display = warpedImg.small.clone();

  // Draw the original rectangular corners in white (thin)
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
      1
    );
  }

  // Project and draw initial boundary (before optimization) in yellow
  console.log("Projecting initial boundary...");
  const initialEdges = projectPageBoundary(corners, pageDims, initialParams, 100);
  const initialPixelEdges = boundaryToPixels(initialEdges, warpedImg.small);
  drawPageBoundary(display, initialPixelEdges, cv, new cv.Scalar(0, 255, 255, 255), 2);

  // Project and draw optimized boundary in red (thick)
  console.log("Projecting optimized boundary...");
  const optimizedEdges = projectPageBoundary(corners, pageDims, optimizedParams, 100);
  const optimizedPixelEdges = boundaryToPixels(optimizedEdges, warpedImg.small);
  drawPageBoundary(display, optimizedPixelEdges, cv, new cv.Scalar(0, 0, 255, 255), 3);

  // Add text labels
  const font = cv.FONT_HERSHEY_SIMPLEX;
  cv.putText(display, "White: Original corners", new cv.Point(10, 30), font, 0.7, new cv.Scalar(255, 255, 255, 255), 2);
  cv.putText(display, "Yellow: Initial model", new cv.Point(10, 60), font, 0.7, new cv.Scalar(0, 255, 255, 255), 2);
  cv.putText(display, "Red: Optimized model", new cv.Point(10, 90), font, 0.7, new cv.Scalar(0, 0, 255, 255), 2);

  // Save the visualization
  const outputPath = `${warpedImg.stem}_boundary_optimized.png`;
  console.log(`Saving visualization to ${outputPath}`);
  await saveMat(display, outputPath);

  display.delete();

  // Extract cubic parameters for analysis
  const cubicA = optimizedParams[6];
  const cubicB = optimizedParams[7];

  console.log("\n=== Results ===");
  console.log(`Page dimensions: ${pageDims[0].toFixed(2)} x ${pageDims[1].toFixed(2)}`);
  console.log(`\nCubic surface parameters:`);
  console.log(`  Alpha (α): ${cubicA.toFixed(4)}`);
  console.log(`  Beta (β): ${cubicB.toFixed(4)}`);
  console.log(`  Curvature strength: ${Math.abs(cubicA + cubicB).toFixed(4)}`);

  console.log("\nVisualization saved to:", outputPath);
  console.log("\nThe red curved boundary shows how the rectangular page");
  console.log("is warped through the optimized cubic surface model.");
  console.log("This represents the actual page edges in the original image.");
}

testOptimizedBoundary().catch(console.error);