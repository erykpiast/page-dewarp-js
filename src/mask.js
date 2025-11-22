import { Config } from "./config.js";
import { getContours } from "./contours.js";
import { getOpenCV } from "./cv-loader.js";
import { debugShow } from "./debug.js";

export function box(width, height) {
  const cv = getOpenCV();
  // struct element of ones
  // cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(width, height));
  return cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(width, height));
}

export class Mask {
  constructor(name, small, pagemask, text = true) {
    this.name = name;
    this.small = small;
    this.pagemask = pagemask;
    this.text = text;
    this.value = null;

    this.calculate();
  }

  calculate() {
    const cv = getOpenCV();
    const sgray = new cv.Mat();
    cv.cvtColor(this.small, sgray, cv.COLOR_RGB2GRAY);

    const mask = new cv.Mat();
    cv.adaptiveThreshold(
      sgray,
      mask,
      255,
      cv.ADAPTIVE_THRESH_MEAN_C,
      cv.THRESH_BINARY_INV,
      Config.ADAPTIVE_WINSZ,
      this.text ? 25 : 7
    );

    this.log(0.1, "thresholded", mask);

    // Morph ops
    if (this.text) {
      const kernel = box(9, 1);
      cv.dilate(mask, mask, kernel);
      kernel.delete();
      this.log(0.2, "dilated", mask);

      const kernel2 = box(1, 3);
      cv.erode(mask, mask, kernel2);
      kernel2.delete();
      this.log(0.3, "eroded", mask);
    } else {
      const kernel = box(3, 1);
      cv.erode(mask, mask, kernel, new cv.Point(-1, -1), 3);
      kernel.delete();
      this.log(0.2, "eroded", mask);

      const kernel2 = box(8, 2);
      cv.dilate(mask, mask, kernel2);
      kernel2.delete();
      this.log(0.3, "dilated", mask);
    }

    // Combine with pagemask
    // np.minimum(mask, pagemask) -> bitwise_and (since they are binary 0/255)
    const finalMask = new cv.Mat();
    cv.bitwise_and(mask, this.pagemask, finalMask);

    mask.delete();
    sgray.delete();

    this.value = finalMask;
  }

  async log(step, text, display) {
    if (Config.DEBUG_LEVEL >= 3) {
      let s = step;
      if (!this.text) s += 0.3;
      await debugShow(this.name, s, text, display);
    }
  }

  contours() {
    return getContours(this.name, this.small, this.value);
  }

  destroy() {
    if (this.value && !this.value.isDeleted()) {
      this.value.delete();
    }
  }
}
