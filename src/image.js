import path from "path";
import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { RemappedImage } from "./dewarp.js";
import { Mask } from "./mask.js";
import { minimize, optimiseParams } from "./optimise.js";
import { projectXY } from "./projection.js";
import { getDefaultParams } from "./solve.js";
import { assembleSpans, keypointsFromSamples, sampleSpans } from "./spans.js";
import { imgsize, jimpToMat, loadJimpImage } from "./utils.js";

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

    console.log("  Calculating page extents...");
    this.calculatePageExtents();

    console.log("  Detecting contours...");
    this.contour_list = this.contourInfo(true); // text=true
    console.log(`  Found ${this.contour_list.length} initial text contours`);

    console.log("  Assembling spans...");
    let spans = this.iterativelyAssembleSpans();

    if (spans.length < 1) {
      console.log(`skipping ${this.stem} because only ${spans.length} spans`);
      return;
    }

    console.log("  Sampling spans...");
    const spanPoints = sampleSpans(this.small, spans);
    const nPts = spanPoints.reduce((a, b) => a + b.length, 0);
    console.log(`  got ${spans.length} spans with ${nPts} points.`);

    console.log("  Getting keypoints...");
    const { corners, ycoords, xcoords } = keypointsFromSamples(
      this.stem,
      this.small,
      this.pagemask,
      this.page_outline,
      spanPoints
    );

    console.log("  Getting default params...");
    let {
      pageDims: roughDims,
      spanCounts,
      params,
    } = getDefaultParams(corners, ycoords, xcoords);

    console.log("  Optimizing params...");
    const dstpoints = [corners[0]].concat(spanPoints.flat());

    params = await optimiseParams(
      this.stem,
      this.small,
      dstpoints,
      spanCounts,
      params
    );

    console.log("  Optimizing page dims...");
    let pageDims = await this.getPageDims(corners, roughDims, params);

    if (pageDims[0] < 0 || pageDims[1] < 0) {
      console.log(
        "Got a negative page dimension! Falling back to rough estimate"
      );
      pageDims = roughDims;
    }

    console.log("  Thresholding/Remapping...");
    await this.threshold(pageDims, params);
    this.written = true;
    console.log("  Done.");
  }

  async load() {
    const cv = getOpenCV();
    const jimpImg = await loadJimpImage(this.imgfile);
    this.cv2_img = jimpToMat(jimpImg);

    const rgb = new cv.Mat();
    cv.cvtColor(this.cv2_img, rgb, cv.COLOR_RGBA2RGB);
    this.cv2_img.delete();
    this.cv2_img = rgb;

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
      const newWidth = Math.round(width * inv_scl);
      const newHeight = Math.round(height * inv_scl);
      const dst = new cv.Mat();
      cv.resize(
        this.cv2_img,
        dst,
        new cv.Size(newWidth, newHeight),
        0,
        0,
        cv.INTER_AREA
      );
      return dst;
    } else {
      return this.cv2_img.clone();
    }
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
    let spans = assembleSpans(
      this.stem,
      this.small,
      this.pagemask,
      this.contour_list
    );
    if (spans.length < 3) {
      console.log(`  detecting lines because only ${spans.length} text spans`);
      this.contour_list = this.contourInfo(false); // lines
      spans = this.attemptReassembleSpans(spans);
    }
    return spans;
  }

  attemptReassembleSpans(prevSpans) {
    const newSpans = assembleSpans(
      this.stem,
      this.small,
      this.pagemask,
      this.contour_list
    );
    return newSpans.length > prevSpans.length ? newSpans : prevSpans;
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
