import path from "path";
import { Config } from "./config.js";
import { getLastContourStats } from "./contours.js";
import { getOpenCV } from "./cv-loader.js";
import { DebugMetrics } from "./debug-metrics.js";
import { RemappedImage } from "./dewarp.js";
import { Mask } from "./mask.js";
import { minimize, optimiseParams } from "./optimise.js";
import { projectXY } from "./projection.js";
import { getDefaultParams } from "./solve.js";
import { assembleSpans, keypointsFromSamples, sampleSpans } from "./spans.js";
import { imgsize, loadImageMat } from "./utils.js";
import { drawProjectedGrid } from "./visualization.js";

/**
 * Orchestrates the full dewarping pipeline from loading to output.
 */
export class WarpedImage {
  constructor(imgfile) {
    this.imgfile = imgfile;
    this.basename = path.basename(imgfile);
    this.stem = path.parse(imgfile).name;
    this.written = false;
    this.cv2_img = null; // Original image (Mat)
    this.small = null; // Resized image (Mat)
    this.pagemask = null; // Mat
    this.page_outline = null; // Array/Mat
    this.contour_list = [];
  }

  async process() {
    console.log("  Loading image...");
    await this.load();
    console.log(
      `  Loaded ${this.basename} at ${imgsize(this.cv2_img)} --> ${imgsize(
        this.small
      )}`
    );

    DebugMetrics.add("image_dims", {
      original: { width: this.cv2_img.cols, height: this.cv2_img.rows },
      resized: { width: this.small.cols, height: this.small.rows },
    });

    console.log("  Calculating page extents...");
    this.calculatePageExtents();

    DebugMetrics.add("page_extents", {
      page_outline: this.page_outline,
    });

    console.log("  Detecting contours...");
    this.contour_list = this.contourInfo(true); // text=true
    console.log(`  Found ${this.contour_list.length} initial text contours`);

    DebugMetrics.add("contours_count", this.contour_list.length);
    const contourStats = getLastContourStats();
    if (contourStats) {
      DebugMetrics.add("contours_stats", contourStats);
    }
    DebugMetrics.add(
      "contours_sample",
      this.contour_list.slice(0, 5).map((c) => ({
        x: c.rect.x,
        y: c.rect.y,
        width: c.rect.width,
        height: c.rect.height,
      }))
    );
    DebugMetrics.add(
      "contours_rects",
      this.contour_list
        .map((c) => ({
          x: c.rect.x,
          y: c.rect.y,
          width: c.rect.width,
          height: c.rect.height,
        }))
        .sort(
          (a, b) =>
            a.y - b.y || a.x - b.x || a.width - b.width || a.height - b.height
        )
    );

    console.log("  Assembling spans...");
    let spans = this.iterativelyAssembleSpans();

    DebugMetrics.add("spans_count", spans.length);
    DebugMetrics.add(
      "spans_sample",
      spans.slice(0, 5).map((span) => ({
        x0: span.length > 0 ? span[0].rect.x : null,
        x1:
          span.length > 0
            ? span[span.length - 1].rect.x + span[span.length - 1].rect.width
            : null,
        y_start: span.length > 0 ? span[0].center[1] : null,
        y_end: span.length > 0 ? span[span.length - 1].center[1] : null,
        contour_count: span.length,
      }))
    );
    if (this.spanStats) {
      DebugMetrics.add("span_stats", this.spanStats);
    }

    if (spans.length < 1) {
      console.log(`skipping ${this.stem} because only ${spans.length} spans`);
      return;
    }

    console.log("  Sampling spans...");
    const spanPoints = sampleSpans(this.small, spans);
    const nPts = spanPoints.reduce((a, b) => a + b.length, 0);
    console.log(`  got ${spans.length} spans with ${nPts} points.`);
    DebugMetrics.add(
      "span_point_counts",
      spanPoints.map((pts) => pts.length)
    );
    DebugMetrics.add(
      "span_points_sample",
      spanPoints.slice(0, 5).map((pts) => pts.slice(0, 5))
    );

    console.log("  Getting keypoints...");
    const { corners, ycoords, xcoords, pageDims: keyPointPageDims } = keypointsFromSamples(
      this.stem,
      this.small,
      this.pagemask,
      this.page_outline,
      spanPoints
    );

    const allKeypoints = [
      ...corners,
      ...xcoords.map((x, i) => [x, ycoords[i]]),
    ];
    DebugMetrics.add("keypoints_count", allKeypoints.length);
    DebugMetrics.add("keypoints_sample", allKeypoints.slice(0, 10));

    console.log("  Getting default params...");
    let {
      pageDims: roughDims,
      spanCounts,
      params,
    } = getDefaultParams(corners, ycoords, xcoords);

    console.log("  Optimizing params...");
    const dstpoints = [corners[0]].concat(spanPoints.flat());

    DebugMetrics.add("dstpoints", dstpoints);

    params = await optimiseParams(
      this.stem,
      this.small,
      dstpoints,
      spanCounts,
      params
    );

    console.log("  Optimizing page dims...");
    let pageDims = await this.getPageDims(corners, roughDims, params);

    DebugMetrics.add("page_dims", pageDims);

    if (pageDims[0] < 0 || pageDims[1] < 0) {
      console.log(
        "Got a negative page dimension! Falling back to rough estimate"
      );
      pageDims = roughDims;
    }

    if (Config.DEBUG_LEVEL >= 1) {
      await drawProjectedGrid(this.stem, this.small, params, pageDims);
    }

    console.log("  Thresholding/Remapping...");
    await this.threshold(pageDims, params);
    this.written = true;

    DebugMetrics.save(`debug/${this.stem}_metrics_js.json`);

    console.log("  Done.");
  }

  async load() {
    const cv = getOpenCV();
    this.cv2_img = await loadImageMat(this.imgfile);

    const bgr = new cv.Mat();
    cv.cvtColor(this.cv2_img, bgr, cv.COLOR_RGBA2BGR);
    this.cv2_img.delete();
    this.cv2_img = bgr;

    this.small = this.resizeToScreen();
  }

  resizeToScreen() {
    const cv = getOpenCV();
    const { rows: height, cols: width } = this.cv2_img;
    const scl_x = width / Config.SCREEN_MAX_W;
    const scl_y = height / Config.SCREEN_MAX_H;
    const scl = Math.ceil(Math.max(scl_x, scl_y));

    if (scl > 1.0) {
      const inv_scl = 1.0 / scl;
      const dst = new cv.Mat();
      cv.resize(
        this.cv2_img,
        dst,
        new cv.Size(0, 0),
        inv_scl,
        inv_scl,
        cv.INTER_AREA
      );
      return dst;
    }
    return this.cv2_img.clone();
  }

  calculatePageExtents() {
    const cv = getOpenCV();
    const { rows: height, cols: width } = this.small;
    const xmin = Config.PAGE_MARGIN_X;
    const ymin = Config.PAGE_MARGIN_Y;
    const xmax = width - xmin;
    const ymax = height - ymin;

    this.pagemask = new cv.Mat.zeros(height, width, cv.CV_8UC1);

    const pt1 = new cv.Point(xmin, ymin);
    const pt2 = new cv.Point(xmax, ymax);
    const color = new cv.Scalar(255);
    cv.rectangle(this.pagemask, pt1, pt2, color, -1);

    this.page_outline = [
      [xmin, ymin],
      [xmin, ymax],
      [xmax, ymax],
      [xmax, ymin],
    ];
  }

  contourInfo(text = true) {
    const c_type = text;
    const mask = new Mask(this.stem, this.small, this.pagemask, c_type);
    const contours = mask.contours();
    mask.destroy();
    return contours;
  }

  iterativelyAssembleSpans() {
    let result = assembleSpans(
      this.stem,
      this.small,
      this.pagemask,
      this.contour_list
    );
    if (result.spans.length < 3) {
      console.log(
        `  detecting lines because only ${result.spans.length} text spans`
      );
      this.contour_list = this.contourInfo(false); // lines
      result = this.attemptReassembleSpans(result);
    }
    this.spanStats = {
      ...result.stats,
      spanCount: result.spans.length,
      totalContours: this.contour_list.length,
    };
    return result.spans;
  }

  attemptReassembleSpans(prevResult) {
    const newResult = assembleSpans(
      this.stem,
      this.small,
      this.pagemask,
      this.contour_list
    );
    return newResult.spans.length > prevResult.spans.length
      ? newResult
      : prevResult;
  }

  async getPageDims(corners, roughDims, params) {
    // optimize page dims
    // corners[2] is Bottom-Right.
    // project(dims) should match corners[2]?
    // dims = [w, h]

    const dst_br = corners[2]; // [x, y]
    const dims = [...roughDims];

    function objective(dimsLocal) {
      const pts = [dimsLocal]; // [[w, h]]
      const proj = projectXY(pts, params); // returns [[x, y]]
      const p = proj[0];
      return Math.pow(dst_br[0] - p[0], 2) + Math.pow(dst_br[1] - p[1], 2);
    }

    const sol = minimize(objective, dims, {
      maxIter: 100,
      tol: 1e-6,
      alpha: 0.1,
    });
    const newDims = sol.x;
    console.log(`  got page dims ${newDims[0]} x ${newDims[1]}`);
    return newDims;
  }

  async threshold(pageDims, params) {
    const remap = new RemappedImage(
      this.stem,
      this.cv2_img,
      this.small,
      pageDims,
      params
    );
    await remap.process();
    this.outfile = remap.threshfile;
  }

  destroy() {
    if (this.cv2_img && !this.cv2_img.isDeleted()) this.cv2_img.delete();
    if (this.small && !this.small.isDeleted()) this.small.delete();
    if (this.pagemask && !this.pagemask.isDeleted()) this.pagemask.delete();
    // page_outline is array, no delete needed.

    if (this.contour_list) {
      this.contour_list.forEach((c) => c.destroy());
    }
  }
}
