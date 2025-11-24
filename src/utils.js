import { createCanvas, loadImage } from "canvas";
import fs from "fs/promises";
import { Jimp } from "jimp";
import { getOpenCV } from "./cv-loader.js";

export function imgsize(img) {
  const { rows, cols } = img;
  return `${cols}x${rows}`;
}

export async function loadImageMat(imgPath) {
  const cv = getOpenCV();
  const image = await loadImage(imgPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, image.width, image.height);
  return cv.matFromImageData(imageData);
}

export async function saveMat(mat, path) {
  const cv = getOpenCV();
  const img = new cv.Mat();

  if (mat.channels() === 1) {
    cv.cvtColor(mat, img, cv.COLOR_GRAY2RGBA);
  } else if (mat.channels() === 3) {
    cv.cvtColor(mat, img, cv.COLOR_RGB2RGBA);
  } else {
    mat.copyTo(img);
  }

  const jimpImg = new Jimp({
    width: img.cols,
    height: img.rows,
    data: Buffer.from(img.data),
  });

  const buffer = await jimpImg.getBuffer("image/png");
  await fs.writeFile(path, buffer);

  img.delete();
}

export function fltp(point) {
  if (point.data32F) {
    return [Math.round(point.data32F[0]), Math.round(point.data32F[1])];
  }
  // point can be simple array [x, y]
  return [Math.round(point[0]), Math.round(point[1])];
}

export function roundNearestMultiple(i, factor) {
  i = Math.round(i);
  const rem = i % factor;
  return rem ? i + factor - rem : i;
}

export function pix2norm(shape, pts) {
  // shape: [height, width] or {rows, cols}
  // pts: array of [x, y] or flat array? Python handles (..., 1, 2)
  // Let's assume pts is array of [x, y]
  const height = shape.rows || shape[0];
  const width = shape.cols || shape[1];
  const scl = 2.0 / Math.max(height, width);
  const offsetX = width * 0.5;
  const offsetY = height * 0.5;

  return pts.map((p) => [(p[0] - offsetX) * scl, (p[1] - offsetY) * scl]);
}

export function norm2pix(shape, pts, asInteger = true) {
  const height = shape.rows || shape[0];
  const width = shape.cols || shape[1];
  const scl = Math.max(height, width) * 0.5;
  const offsetX = width * 0.5;
  const offsetY = height * 0.5;

  return pts.map((p) => {
    let x = p[0] * scl + offsetX;
    let y = p[1] * scl + offsetY;
    if (asInteger) {
      x = Math.trunc(x + 0.5);
      y = Math.trunc(y + 0.5);
    }
    return [x, y];
  });
}
