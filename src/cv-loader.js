import opencv from "opencv-wasm";

// Helper to nuke .then
function stripThen(obj) {
  if (obj && typeof obj.then === "function") {
    console.log("Stripping .then from opencv object to prevent await hang");
    try {
      obj.then = undefined;
    } catch (e) {
      console.error("Failed to set .then to undefined", e);
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
  return opencv.cv; // Hopefully already stripped if load called
}
