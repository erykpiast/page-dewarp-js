/**
 * @module config
 * @description Global configuration for the page-dewarp pipeline.
 * Contains camera parameters, detection thresholds, and output settings.
 */

export const Config = {
  // [camera_opts]
  FOCAL_LENGTH: 1.2,

  // [contour_opts]
  TEXT_MIN_WIDTH: 15,
  TEXT_MIN_HEIGHT: 2,
  TEXT_MIN_ASPECT: 1.5,
  TEXT_MAX_THICKNESS: 10,

  // [debug_lvl_opt]
  DEBUG_LEVEL: 0,

  // [debug_out_opt]
  DEBUG_OUTPUT: "file",

  // [edge_opts]
  EDGE_MAX_OVERLAP: 1.0,
  EDGE_MAX_LENGTH: 100.0,
  EDGE_ANGLE_COST: 10.0,
  EDGE_MAX_ANGLE: 7.5,

  // [image_opts]
  SCREEN_MAX_W: 1280,
  SCREEN_MAX_H: 700,
  PAGE_MARGIN_X: 50,
  PAGE_MARGIN_Y: 20,

  // [mask_opts]
  ADAPTIVE_WINSZ: 55,

  // [optim_opts]
  OPTIM_MAX_ITER: 60,
  OPTIM_TOL: 1e-6,

  // [output_opts]
  OUTPUT_ZOOM: 1.0,
  OUTPUT_DPI: 300,
  REMAP_DECIMATE: 16,
  NO_BINARY: 0,

  // [pdf_opts]
  CONVERT_TO_PDF: false,

  // [proj_opts]
  RVEC_IDX: [0, 3],
  TVEC_IDX: [3, 6],
  CUBIC_IDX: [6, 8],

  // [span_opts]
  SPAN_MIN_WIDTH: 30,
  SPAN_PX_PER_STEP: 20,
};

export function updateConfig(newConfig) {
  Object.assign(Config, newConfig);
}
