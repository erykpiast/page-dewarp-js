#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Config, updateConfig } from "./config.js";
import { loadOpenCV } from "./cv-loader.js";
import { WarpedImage } from "./image.js";

async function main() {
  const argv = yargs(hideBin(process.argv))
    .usage("Usage: $0 [options] <input_images...>")
    .option("debug-level", {
      alias: "d",
      type: "number",
      default: Config.DEBUG_LEVEL,
    })
    .option("debug-output", {
      alias: "o",
      type: "string",
      choices: ["file", "screen", "both"],
      default: Config.DEBUG_OUTPUT,
    })
    .option("pdf", {
      alias: "p",
      type: "boolean",
      default: Config.CONVERT_TO_PDF,
    })
    .option("max-screen-width", {
      alias: "vw",
      type: "number",
      default: Config.SCREEN_MAX_W,
    })
    .option("max-screen-height", {
      alias: "vh",
      type: "number",
      default: Config.SCREEN_MAX_H,
    })
    .option("x-margin", {
      alias: "x",
      type: "number",
      default: Config.PAGE_MARGIN_X,
    })
    .option("y-margin", {
      alias: "y",
      type: "number",
      default: Config.PAGE_MARGIN_Y,
    })
    .option("min-text-width", {
      alias: "tw",
      type: "number",
      default: Config.TEXT_MIN_WIDTH,
    })
    .option("min-text-height", {
      alias: "th",
      type: "number",
      default: Config.TEXT_MIN_HEIGHT,
    })
    .option("min-text-aspect", {
      alias: "ta",
      type: "number",
      default: Config.TEXT_MIN_ASPECT,
    })
    .option("max-text-thickness", {
      alias: "tk",
      type: "number",
      default: Config.TEXT_MAX_THICKNESS,
    })
    .option("adaptive-winsz", {
      alias: "wz",
      type: "number",
      default: Config.ADAPTIVE_WINSZ,
    })
    .option("min-span-width", {
      alias: "sw",
      type: "number",
      default: Config.SPAN_MIN_WIDTH,
    })
    .option("span-spacing", {
      alias: "sp",
      type: "number",
      default: Config.SPAN_PX_PER_STEP,
    })
    .option("optim-max-iter", {
      alias: "oi",
      type: "number",
      default: Config.OPTIM_MAX_ITER,
    })
    .option("optim-tol", {
      alias: "ot",
      type: "number",
      default: Config.OPTIM_TOL,
    })
    .option("max-edge-overlap", {
      alias: "eo",
      type: "number",
      default: Config.EDGE_MAX_OVERLAP,
    })
    .option("max-edge-length", {
      alias: "el",
      type: "number",
      default: Config.EDGE_MAX_LENGTH,
    })
    .option("edge-angle-cost", {
      alias: "ec",
      type: "number",
      default: Config.EDGE_ANGLE_COST,
    })
    .option("max-edge-angle", {
      alias: "ea",
      type: "number",
      default: Config.EDGE_MAX_ANGLE,
    })
    .option("focal-length", {
      alias: "f",
      type: "number",
      default: Config.FOCAL_LENGTH,
    })
    .option("output-zoom", {
      alias: "z",
      type: "number",
      default: Config.OUTPUT_ZOOM,
    })
    .option("output-dpi", {
      alias: "dpi",
      type: "number",
      default: Config.OUTPUT_DPI,
    })
    .option("no-binary", {
      alias: "nb",
      type: "number",
      default: Config.NO_BINARY,
    })
    .option("shrink", {
      alias: "s",
      type: "number",
      default: Config.REMAP_DECIMATE,
    })
    .demandCommand(1, "You must provide at least one input image.")
    .help().argv;

  // Map argv to Config keys
  const configUpdates = {
    DEBUG_LEVEL: argv.debugLevel,
    DEBUG_OUTPUT: argv.debugOutput,
    CONVERT_TO_PDF: argv.pdf,
    SCREEN_MAX_W: argv.maxScreenWidth,
    SCREEN_MAX_H: argv.maxScreenHeight,
    PAGE_MARGIN_X: argv.xMargin,
    PAGE_MARGIN_Y: argv.yMargin,
    TEXT_MIN_WIDTH: argv.minTextWidth,
    TEXT_MIN_HEIGHT: argv.minTextHeight,
    TEXT_MIN_ASPECT: argv.minTextAspect,
    TEXT_MAX_THICKNESS: argv.maxTextThickness,
    ADAPTIVE_WINSZ: argv.adaptiveWinsz,
    SPAN_MIN_WIDTH: argv.minSpanWidth,
    SPAN_PX_PER_STEP: argv.spanSpacing,
    EDGE_MAX_OVERLAP: argv.maxEdgeOverlap,
    EDGE_MAX_LENGTH: argv.maxEdgeLength,
    EDGE_ANGLE_COST: argv.edgeAngleCost,
    EDGE_MAX_ANGLE: argv.maxEdgeAngle,
    FOCAL_LENGTH: argv.focalLength,
    OUTPUT_ZOOM: argv.outputZoom,
    OUTPUT_DPI: argv.outputDpi,
    NO_BINARY: argv.noBinary,
    REMAP_DECIMATE: argv.shrink,
    OPTIM_MAX_ITER: argv.optimMaxIter,
    OPTIM_TOL: argv.optimTol,
  };

  updateConfig(configUpdates);

  console.log("Loading OpenCV...");
  await loadOpenCV();
  console.log("OpenCV loaded.");

  const inputFiles = argv._;

  for (const inputFile of inputFiles) {
    console.log(`Processing ${inputFile}...`);
    try {
      const warpedImage = new WarpedImage(inputFile);
      console.log(`Starting processing for ${inputFile}`);
      await warpedImage.process();
      warpedImage.destroy();
      console.log(`Finished processing ${inputFile}`);
    } catch (err) {
      console.error(`Failed to process ${inputFile}:`, err);
    }
  }
}

main().catch(console.error);
