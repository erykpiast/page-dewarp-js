import { solveDLT } from "./dlt.js";
import { refinePose } from "./optimizer.js";

/**
 * Finds an object pose from 3D-2D point correspondences.
 * Mirrors OpenCV's solvePnP.
 *
 * @param {Array<Array<number>>} objectPoints - 3D object points
 * @param {Array<Array<number>>} imagePoints - 2D image points
 * @param {Array<number>} cameraMatrix - 3x3 camera matrix
 * @param {Array<number>} distCoeffs - Distortion coefficients
 * @returns {{ rvec: Array<number>, tvec: Array<number>, success: boolean }}
 */
export function solvePnP(objectPoints, imagePoints, cameraMatrix, distCoeffs = []) {
  if (objectPoints.length !== imagePoints.length) {
    throw new Error("solvePnP: objectPoints and imagePoints must have same length");
  }

  // 1. Initialization (DLT)
  const initPose = solveDLT(objectPoints, imagePoints, cameraMatrix);
  
  // 2. Refinement (Levenberg-Marquardt)
  // We iterate to minimize reprojection error
  const refined = refinePose(
    initPose.rvec, 
    initPose.tvec, 
    objectPoints, 
    imagePoints, 
    cameraMatrix, 
    distCoeffs
  );
  
  return {
    rvec: refined.rvec,
    tvec: refined.tvec,
    success: true
  };
}

