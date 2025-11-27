/**
 * @module page-dewarp-js
 * @description Public API for the page-dewarp-js library.
 *
 * A JavaScript implementation of the page-dewarp library for automatically
 * detecting curved page boundaries, estimating 3D shape, and generating
 * flattened output images.
 */

export { Config, updateConfig } from "./config.js";
export { getOpenCV, loadOpenCV } from "./cv-loader.js";
export { WarpedImage } from "./image.js";
