#!/usr/bin/env node

/**
 * Visualizes the curved page boundary transformation.
 * Shows how the rectangular page corners are transformed through the cubic surface model.
 */

import { loadOpenCV } from "./src/cv-loader.js";
import { WarpedImage } from "./src/image.js";
import { projectPageBoundary, boundaryToPixels, drawPageBoundary } from "./src/page-boundary.js";
import { saveMat, norm2pix } from "./src/utils.js";
import { Config } from "./src/config.js";

async function visualizeBoundary() {
  await loadOpenCV();
  const cv = (await import("./src/cv-loader.js")).getOpenCV();

  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Usage: node visualize-boundary.js <image-path>");
    process.exit(1);
  }

  console.log(`Processing: ${imagePath}\n`);

  try {
    // Run the full pipeline
    const warpedImg = new WarpedImage(imagePath);

    // Process will handle everything including optimization
    await warpedImg.process();

    // After processing, we have access to optimized params
    // Let's extract them from the debug metrics
    const { DebugMetrics } = await import("./src/debug-metrics.js");
    const metrics = DebugMetrics.getAll();

    if (!metrics.keypoint_corners) {
      console.error("No keypoint corners found. Image may not have enough text.");
      return;
    }

    const corners = metrics.keypoint_corners;
    const params = metrics.final_params || metrics.initial_params;

    if (!params) {
      console.error("No parameters found in debug metrics.");
      return;
    }

    // Get page dimensions from corners
    const pageWidth = Math.sqrt(
      Math.pow(corners[1][0] - corners[0][0], 2) +
      Math.pow(corners[1][1] - corners[0][1], 2)
    );
    const pageHeight = Math.sqrt(
      Math.pow(corners[3][0] - corners[0][0], 2) +
      Math.pow(corners[3][1] - corners[0][1], 2)
    );
    const pageDims = [pageWidth, pageHeight];

    // Create visualization
    console.log("Creating boundary visualization...");
    const display = warpedImg.small.clone();

    // Draw original rectangular corners (white, thin)
    const pixCorners = norm2pix(warpedImg.small, corners);
    for (let j = 0; j < 4; j++) {
      const p1 = pixCorners[j];
      const p2 = pixCorners[(j + 1) % 4];
      cv.line(
        display,
        new cv.Point(Math.round(p1[0]), Math.round(p1[1])),
        new cv.Point(Math.round(p2[0]), Math.round(p2[1])),
        new cv.Scalar(255, 255, 255, 255),
        2
      );
    }

    // Project the curved boundary
    console.log("Projecting curved boundary...");
    const projectedEdges = projectPageBoundary(corners, pageDims, params, 150);
    const pixelEdges = boundaryToPixels(projectedEdges, warpedImg.small);

    // Draw curved boundary (red, thick)
    drawPageBoundary(display, pixelEdges, cv, new cv.Scalar(0, 0, 255, 255), 3);

    // Add legend
    const font = cv.FONT_HERSHEY_SIMPLEX;
    const bgRect = new cv.Rect(10, 10, 350, 70);
    cv.rectangle(display, bgRect, new cv.Scalar(0, 0, 0, 200), -1);

    cv.putText(display, "Page Boundary Visualization",
      new cv.Point(20, 35), font, 0.7, new cv.Scalar(255, 255, 255, 255), 2);
    cv.putText(display, "White: Detected page corners",
      new cv.Point(20, 55), font, 0.5, new cv.Scalar(255, 255, 255, 255), 1);
    cv.putText(display, "Red: Curved page boundary (after dewarp model)",
      new cv.Point(20, 75), font, 0.5, new cv.Scalar(0, 0, 255, 255), 1);

    // Save output
    const outputPath = `${warpedImg.stem}_boundary_viz.png`;
    await saveMat(display, outputPath);
    display.delete();

    // Report results
    const cubicA = params[6] || 0;
    const cubicB = params[7] || 0;

    console.log("\n=== Boundary Transformation Results ===");
    console.log(`Output saved to: ${outputPath}`);
    console.log(`\nPage dimensions: ${pageWidth.toFixed(2)} x ${pageHeight.toFixed(2)}`);
    console.log(`\nCubic surface parameters:`);
    console.log(`  Alpha (α): ${cubicA.toFixed(4)}`);
    console.log(`  Beta (β): ${cubicB.toFixed(4)}`);

    const curvature = Math.abs(cubicA + cubicB);
    if (curvature < 0.01) {
      console.log("  → Page appears flat (minimal curvature)");
    } else if (curvature < 0.1) {
      console.log("  → Page has slight curvature");
    } else {
      console.log("  → Page has significant curvature");
    }

    console.log("\nThe red boundary shows how the rectangular page outline");
    console.log("maps through the detected 3D curvature of the page.");
    console.log("This curved boundary represents the actual page edges in the image.");

    // Clean up
    warpedImg.destroy();

  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
  }
}

visualizeBoundary().catch(console.error);