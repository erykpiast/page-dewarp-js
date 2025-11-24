import opencv from "opencv-wasm";

function stripThen(obj) {
  if (obj && typeof obj.then === "function") {
    try {
      obj.then = undefined;
    } catch (e) {
      // Silently handle error
    }
  }
  return obj;
}

export async function loadOpenCV() {
  // Ensure .then is gone before returning
  const cv = opencv.cv;
  if (!cv) throw new Error("opencv.cv is missing");
  return stripThen(cv);
}

export function getOpenCV() {
  if (!opencv.cv) {
    throw new Error("OpenCV not loaded properly?");
  }
  return opencv.cv; 
}
