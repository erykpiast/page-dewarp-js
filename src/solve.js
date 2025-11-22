import { Config } from "./config.js";
import { getOpenCV } from "./cv-loader.js";
import { getK } from "./projection.js";

export function getDefaultParams(corners, ycoords, xcoords) {
  const cv = getOpenCV();
  
  // page_width, page_height from corners (norm distance)
  // corners is 4 points [x,y]
  // 0: TL, 1: TR, 2: BR, 3: BL
  // width = dist(corners[0], corners[1]) ?
  // Python: (np.linalg.norm(corners[i] - corners[0]) for i in (1, -1))
  // i=1 (TR), i=-1 (BL)
  // So width = dist(c0, c1), height = dist(c0, c3)
  
  function dist(p1, p2) {
      return Math.sqrt(Math.pow(p1[0]-p2[0], 2) + Math.pow(p1[1]-p2[1], 2));
  }
  
  const pageWidth = dist(corners[0], corners[1]);
  const pageHeight = dist(corners[0], corners[3]);
  
  const cubicSlopes = [0.0, 0.0];
  
  // Manual solvePnP (Homography method)
  // We assume the page is planar (z=0).
  // Map object points (x,y) to image points (u,v).
  
  const srcPtsData = []; // Object points (x,y)
  const dstPtsData = []; // Image points (u,v)
  
  // 0,0 -> c0
  srcPtsData.push(0, 0); dstPtsData.push(corners[0][0], corners[0][1]);
  // w,0 -> c1
  srcPtsData.push(pageWidth, 0); dstPtsData.push(corners[1][0], corners[1][1]);
  // w,h -> c2
  srcPtsData.push(pageWidth, pageHeight); dstPtsData.push(corners[2][0], corners[2][1]);
  // 0,h -> c3
  srcPtsData.push(0, pageHeight); dstPtsData.push(corners[3][0], corners[3][1]);
  
  const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, srcPtsData);
  const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, dstPtsData);
  
  const H = cv.findHomography(srcMat, dstMat);
  // H is 3x3 Mat CV_64F (usually)
  
  // Decompose H to R, t
  // H = K * [r1 r2 t]
  // K = diag(f, f, 1)
  // K_inv = diag(1/f, 1/f, 1)
  // [r1' r2' t'] = K_inv * H
  
  const f = Config.FOCAL_LENGTH;
  
  const h00 = H.doubleAt(0,0), h01 = H.doubleAt(0,1), h02 = H.doubleAt(0,2);
  const h10 = H.doubleAt(1,0), h11 = H.doubleAt(1,1), h12 = H.doubleAt(1,2);
  const h20 = H.doubleAt(2,0), h21 = H.doubleAt(2,1), h22 = H.doubleAt(2,2);
  
  // Multiply by K_inv
  // r1' = [h00/f, h10/f, h20]
  let r1x = h00/f, r1y = h10/f, r1z = h20;
  let r2x = h01/f, r2y = h11/f, r2z = h21;
  let tx  = h02/f, ty  = h12/f, tz  = h22;
  
  // Normalize r1
  const norm1 = Math.sqrt(r1x*r1x + r1y*r1y + r1z*r1z);
  r1x /= norm1; r1y /= norm1; r1z /= norm1;
  
  // Normalize r2?
  // Ideally r1 and r2 are orthonormal.
  // Usually we take average scale?
  const norm2 = Math.sqrt(r2x*r2x + r2y*r2y + r2z*r2z);
  // For valid rotation, norm1 should be equal to norm2 approx.
  // And t should be scaled by same factor?
  // Wait, H is up to scale.
  // Scale factor lambda = 1 / ((norm1 + norm2)/2) ?
  // Actually, if we normalize r1, the scale is fixed.
  // t should be scaled by 1/norm1 (or average).
  
  const scale = (norm1 + norm2) / 2;
  r2x /= scale; r2y /= scale; r2z /= scale;
  tx /= scale; ty /= scale; tz /= scale;
  
  // Enforce orthogonality: r1 . r2 = 0
  // We can use Gram-Schmidt or just cross product to find r3, then recompute r2?
  // r3 = r1 x r2
  let r3x = r1y*r2z - r1z*r2y;
  let r3y = r1z*r2x - r1x*r2z;
  let r3z = r1x*r2y - r1y*r2x;
  
  // Normalize r3
  const norm3 = Math.sqrt(r3x*r3x + r3y*r3y + r3z*r3z);
  r3x /= norm3; r3y /= norm3; r3z /= norm3;
  
  // Recompute r2 = r3 x r1
  r2x = r3y*r1z - r3z*r1y;
  r2y = r3z*r1x - r3x*r1z;
  r2z = r3x*r1y - r3y*r1x;
  
  // Rotation matrix R
  const R_data = [
      r1x, r2x, r3x,
      r1y, r2y, r3y,
      r1z, r2z, r3z
  ];
  const R = cv.matFromArray(3, 3, cv.CV_64F, R_data);
  
  const rvec = new cv.Mat();
  cv.Rodrigues(R, rvec);
  
  const spanCounts = xcoords.map(xc => xc.length);
  
  const params = [];
  
  // rvec
  for(let i=0; i<3; i++) params.push(rvec.data64F[i]);
  // tvec
  params.push(tx, ty, tz);
  // cubic
  params.push(0.0, 0.0);
  // ycoords
  ycoords.forEach(y => params.push(y));
  // xcoords
  xcoords.forEach(xc => xc.forEach(x => params.push(x)));
  
  srcMat.delete(); dstMat.delete(); H.delete(); R.delete(); rvec.delete();
  
  return {
      pageDims: [pageWidth, pageHeight],
      spanCounts,
      params
  };
}

